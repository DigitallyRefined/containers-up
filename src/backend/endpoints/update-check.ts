import type { Host } from '@/backend/db/schema/host';
import { getContainers } from '@/backend/endpoints/containers';
import { createDockerExec } from '@/backend/utils/docker';
import { getLogs, mainLogger } from '@/backend/utils/logger';
import { log as logDb } from '@/backend/db/log';
import { job as jobDb } from '@/backend/db/job';
import { JobStatus } from '@/backend/db/schema/job';
import { batchPromises } from '@/backend/utils';

const event = 'update-check';
const logger = mainLogger.child({ event });
const dockerExec = createDockerExec(logger);

const getSmallHash = (digest: string) => {
  const match = digest.split(':');
  return match ? match[1].slice(0, 7) : digest;
};

const getImagesToCheck = async (
  selectedHostname: string,
  containers: Awaited<ReturnType<typeof getContainers>>,
  checkService?: string | undefined
) => {
  const imagesToCheck = new Map<string, string>();
  const composedContainers = new Map<
    string,
    Array<{ name: string; image: string; digest: string }>
  >();

  for (const [composeFile, { services }] of Object.entries(containers.composedContainers)) {
    const containers = [];
    for (const service of services) {
      if (checkService && checkService !== service.Config.Image) continue;
      const digest = await dockerExec.getLocalImageDigest(selectedHostname, service.Image);
      if (digest) {
        imagesToCheck.set(digest, service.Config.Image);
      } else {
        logger.warn(`Not checking: "${service.Config.Image}" image does not have a digest`);
      }
      containers.push({ name: service.Name, image: service.Config.Image, digest });
    }
    composedContainers.set(composeFile, containers);
  }

  return { imagesToCheck, composedContainers };
};

const isRunning = {};
export const checkHostForImageUpdates = async (
  selectedHost: Host,
  checkService?: string | undefined
) => {
  if (isRunning[selectedHost.name]) {
    logger.info(`Update check already in progress for ${selectedHost.name}, skipping this run.`);
    return;
  }
  isRunning[selectedHost.name] = true;

  const containers = await getContainers(selectedHost);

  const { imagesToCheck, composedContainers } = await getImagesToCheck(
    selectedHost.name,
    containers,
    checkService
  );

  const digests = await batchPromises(
    Array.from(imagesToCheck),
    2,
    async ([localDigest, imageName]) => {
      let remoteDigest = localDigest;
      try {
        remoteDigest = await dockerExec.getRemoteImageDigest(selectedHost, imageName);
      } catch (err) {
        // already logged
      }
      return { imageName, localDigest, remoteDigest };
    }
  );

  const imagesToUpdate = [];
  digests.forEach(({ imageName, localDigest, remoteDigest }) => {
    if (!localDigest || !remoteDigest) {
      logger.error('Could not retrieve both local and remote digests');
      return;
    }

    if (!localDigest.endsWith(remoteDigest)) {
      const updateData = {
        imageName,
        localDigest,
        remoteDigest,
      };
      logger.debug(updateData, `Update available for image "${imageName}"`);
      imagesToUpdate.push(updateData);
    }
  });

  // Create a new job
  if (imagesToUpdate.length) {
    for (const imageToUpdate of imagesToUpdate) {
      for (const [composeFile, containers] of composedContainers) {
        if (containers.some((c) => c.image === imageToUpdate.imageName)) {
          const folder = `/${composeFile.split('/').slice(0, -1).join('/')}`;
          await jobDb.upsert({
            hostId: selectedHost.id,
            folder,
            title: `Bump ${imageToUpdate.imageName} from \`${getSmallHash(
              imageToUpdate.localDigest
            )}\` to \`${getSmallHash(imageToUpdate.remoteDigest)}\` in ${folder}`,
            status: JobStatus.open,
          });
        }
      }
    }
  }

  // save logs
  getLogs(event).forEach(async (log) => await logDb.create({ hostId: selectedHost.id, ...log }));

  isRunning[selectedHost.name] = false;
};

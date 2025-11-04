import { job as jobDb } from '@/backend/db/job';
import { log as logDb } from '@/backend/db/log';
import type { Host } from '@/backend/db/schema/host';
import { JobStatus } from '@/backend/db/schema/job';
import { getContainers } from '@/backend/endpoints/containers';
import { batchPromises } from '@/backend/utils';
import { createDockerExec } from '@/backend/utils/docker';
import { getRemoteConfigDigestFromRef } from '@/backend/utils/docker/remote-image-digest';
import { getLogs, mainLogger } from '@/backend/utils/logger';
import { sendNotification } from '@/backend/utils/notification';

const event = 'update-check';
const logger = mainLogger.child({ event });
const dockerExec = createDockerExec(logger);

const getSmallHash = (digest: string) => {
  const match = digest.split(':');
  return match ? match[1].slice(0, 7) : digest;
};

const getImagesToCheck = async (
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
      const digest = service.Image;
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
  logger.info(`Checking images for updates on "${selectedHost.name}"...`);
  let updateCount = 0;

  if (isRunning[selectedHost.name]) {
    logger.info(`Update check already in progress for "${selectedHost.name}", skipping this run.`);
    return;
  }
  isRunning[selectedHost.name] = true;

  const containers = await getContainers(selectedHost);

  const { imagesToCheck, composedContainers } = await getImagesToCheck(containers, checkService);

  const { os, arch } = await dockerExec.getServerPlatform(selectedHost.name);

  const digests = await batchPromises(
    Array.from(imagesToCheck),
    2,
    async ([localDigest, imageName]) => {
      let remoteDigest = localDigest;
      try {
        remoteDigest = await getRemoteConfigDigestFromRef(imageName, os, arch);
      } catch (err) {
        logger.error(
          err,
          `Failed to retrieve remote digest and check for image tag updates for "${imageName}". Make sure DOCKER/GHCR_USERNAME/TOKEN are set, see \`.env.default\``
        );
      }

      return { imageName, localDigest, remoteDigest };
    }
  );

  const imagesToUpdate = [];
  digests.forEach(async ({ imageName, localDigest, remoteDigest }) => {
    if (!localDigest || !remoteDigest) {
      logger.error(`Could not retrieve both local and remote digests for "${imageName}"`);
      return;
    }

    logger.debug(
      { localDigest, remoteDigest },
      `Checking if update is available for "${imageName}" (config digest)`
    );

    if (localDigest !== remoteDigest) {
      const updateData = {
        imageName,
        localDigest,
        remoteDigest,
      };
      logger.info(updateData, `Update available for image "${imageName}"`);
      imagesToUpdate.push(updateData);
      updateCount++;
    } else {
      logger.info(`No update available for image "${imageName}"`);
    }
  });

  // Create a new job
  if (imagesToUpdate.length) {
    for (const imageToUpdate of imagesToUpdate) {
      for (const [composeFile, containers] of composedContainers) {
        if (containers.some((c) => c.image === imageToUpdate.imageName)) {
          const folder = `/${composeFile.split('/').slice(0, -1).join('/')}`;
          const title = `Bump ${imageToUpdate.imageName} from \`${getSmallHash(
            imageToUpdate.localDigest
          )}\` to \`${getSmallHash(imageToUpdate.remoteDigest)}\` in ${folder}`;
          await jobDb.upsert({
            hostId: selectedHost.id,
            folder,
            title,
            status: JobStatus.open,
          });

          sendNotification({
            hostName: selectedHost.name,
            subject: `${imageToUpdate.imageName} update available on ${selectedHost.name}`,
            message: `A new image update is available for "${imageToUpdate.imageName}" on ${selectedHost.name}.\n\n${title}`,
          });
        }
      }
    }
  }

  logger.info(
    `Update check finished. Found ${updateCount} images to update on "${selectedHost.name}"`
  );

  // save logs
  getLogs(event).forEach(async (log) => await logDb.create({ hostId: selectedHost.id, ...log }));

  isRunning[selectedHost.name] = false;
};

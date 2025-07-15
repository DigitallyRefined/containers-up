import { getIcon } from '@/backend/utils/icon';
import { createExec } from '@/backend/utils/exec';
import type { Repo } from '@/backend/db/repo';
import { mainLogger } from '@/backend/utils/logger';
import { baseEvent as githubWebhookBaseEvent } from '@/backend/endpoints/webhook/github';
import { job as jobDb } from '@/backend/db/job';

const event = 'containers';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

const getUnusedDockerImages = async (containers, images) => {
  const usedImageIds = new Set(containers.map((container) => container.Image));
  return images.filter((img) => !usedImageIds.has(img.ID));
};

const getContainersRunningViaCompose = async (context: string) => {
  const containers = await exec.listContainers(context);
  const composedContainers = containers.filter(
    (container) =>
      container.Config.Labels &&
      Object.prototype.hasOwnProperty.call(
        container.Config.Labels,
        'com.docker.compose.project.config_files'
      )
  );

  const composedIds = new Set(composedContainers.map((container) => container.Id));
  const nonComposedContainers = containers.filter((container) => !composedIds.has(container.Id));

  return { containers, composedContainers, nonComposedContainers };
};

export const getContainers = async (selectedRepo: Repo) => {
  const [images, { containers, composedContainers, nonComposedContainers }] = await Promise.all([
    exec.listImages(selectedRepo.name),
    getContainersRunningViaCompose(selectedRepo.name),
  ]);

  const composedContainersSortedByImage = [];
  images.forEach((image) => {
    composedContainers
      .filter((container) => container.Image === image.ID)
      .forEach((container) => {
        getIcon(container.Config.Labels['com.docker.compose.service']);
        composedContainersSortedByImage.push(container);
      });
  });

  const composeFiles = new Set();
  const composedContainersByComposeFileMap = new Map();
  for (const container of composedContainersSortedByImage) {
    const configFilesLabel = container.Config.Labels['com.docker.compose.project.config_files'];
    let composeFile = '[unmanaged]';
    if (configFilesLabel) {
      composeFiles.add(configFilesLabel);
      composeFile = configFilesLabel;
    }

    Object.keys(container.Config.Labels)
      .filter((key) => key.startsWith('traefik.http.routers.') && key.endsWith('.rule'))
      .forEach((ruleLabelKey) => {
        const ruleLabel = container.Config.Labels[ruleLabelKey];
        if (!ruleLabel) {
          return;
        }
        const host = ruleLabel
          .replaceAll('Host(`', '')
          .replaceAll('`)', '')
          .replaceAll('&&', '')
          .replaceAll('PathPrefix(`', '')
          .replaceAll('Path(`', '')
          .replaceAll(' ', '');
        const tlsLabelKey = Object.keys(container.Config.Labels).find(
          (key) => key.startsWith('traefik.http.routers.') && key.endsWith('.tls')
        );
        const isTls = tlsLabelKey ? container.Config.Labels[tlsLabelKey] === 'true' : undefined;
        if (!container.urls) container.urls = [];
        container.urls.push(`http${isTls ? 's' : ''}://${host}`);
      });

    const relativeComposeFile = composeFile.replace(`${selectedRepo.workingFolder}/`, '');
    if (!composedContainersByComposeFileMap.has(relativeComposeFile)) {
      composedContainersByComposeFileMap.set(relativeComposeFile, []);
    }
    composedContainersByComposeFileMap.get(relativeComposeFile).push(container);
  }

  const composedContainersByComposeFile = Object.fromEntries(
    await Promise.all(
      Array.from(composedContainersByComposeFileMap.entries()).map(
        async ([composeFile, containers]) => {
          const composeFileFolder = composeFile
            .replace(`${selectedRepo.workingFolder}/`, '')
            .split('/');
          composeFileFolder.pop();

          return [
            composeFile,
            {
              services: containers,
              jobs: await jobDb.getJobsWithLogs(selectedRepo.id, `/${composeFileFolder.join('/')}`),
            },
          ];
        }
      )
    )
  );

  return {
    composedContainers: composedContainersByComposeFile,
    separateContainers: nonComposedContainers,
    images,
    unusedDockerImages: await getUnusedDockerImages(containers, images),
  };
};

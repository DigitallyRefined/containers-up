import { getIcon } from '../utils/icon';
import { listContainers, listImages } from '../utils/docker';
import type { Repo } from '../db/repo';

const getUnusedDockerImages = async (containers, images) => {
  const usedImageIds = new Set(containers.map((container) => container.Image));
  return images.filter((img) => !usedImageIds.has(img.ID));
};

const getContainersRunningViaCompose = async () => {
  const containers = await listContainers();
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
    listImages(),
    getContainersRunningViaCompose(),
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
      // if (await pathExists(configFilesLabel)) {
      composeFiles.add(configFilesLabel);
      composeFile = configFilesLabel;
      // }
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

  const composedContainersByComposeFile = Object.fromEntries(composedContainersByComposeFileMap);

  return {
    composedContainers: composedContainersByComposeFile,
    separateContainers: nonComposedContainers,
    images,
    unusedDockerImages: await getUnusedDockerImages(containers, images),
  };
};

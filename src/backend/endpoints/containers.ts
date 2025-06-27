import { containerApi } from './container/socket';
import { promises as fs } from 'fs';
import * as path from 'path';

const getUnusedDockerImages = async (containers, images) => {
  const usedImageIds = new Set(containers.map((c: any) => c.ImageID));
  return images
    .filter((img: any) => !usedImageIds.has(img.Id))
    .map((img) => ({ Image: `${img.RepoTags ? img.RepoTags[0] : '<none>'}`, Id: img.Id }));
};

const getContainersRunningViaCompose = async () => {
  const containers = await containerApi.listContainers({ all: true });
  const composedContainers = containers.filter(
    (container: any) =>
      container.Labels &&
      Object.prototype.hasOwnProperty.call(
        container.Labels,
        'com.docker.compose.project.config_files'
      )
  );

  const composedIds = new Set(composedContainers.map((c: any) => c.Id));
  const nonComposedContainers = containers.filter(
    (container: any) => !composedIds.has(container.Id)
  );

  return { containers, composedContainers, nonComposedContainers };
};

export const getContainers = async () => {
  const [images, { containers, composedContainers, nonComposedContainers }] = await Promise.all([
    containerApi.listImages(),
    getContainersRunningViaCompose(),
  ]);

  const unusedDockerImages = await getUnusedDockerImages(containers, images);

  const composedContainersSortedByImage: any = [];
  images.forEach(({ Id }: any) => {
    composedContainers
      .filter((container: any) => container.ImageID === Id)
      .forEach((container: any) => {
        composedContainersSortedByImage.push(container);
      });
  });

  const composeFiles = new Set();
  const composedContainersByComposeFileMap = new Map<string, any[]>();
  for (const container of composedContainersSortedByImage) {
    const configFilesLabel = container.Labels['com.docker.compose.project.config_files'];
    let composeFile = '[unmanaged]';
    if (configFilesLabel) {
      const internalComposeFile = `/containers${configFilesLabel.replace(
        process.env.SHARE_HOME || '',
        ''
      )}`;
      const composeFileExists = await fs
        .access(internalComposeFile)
        .then(() => true)
        .catch(() => false);
      if (composeFileExists) {
        composeFiles.add(internalComposeFile);
        composeFile = internalComposeFile;
      }
    }
    container.composeFile = composeFile;

    const ruleLabelKey = Object.keys(container.Labels).find(
      (key) => key.startsWith('traefik.http.routers.') && key.endsWith('.rule')
    );
    const ruleLabel = ruleLabelKey ? container.Labels[ruleLabelKey] : undefined;
    if (ruleLabel) {
      const host = ruleLabel
        .replaceAll('Host(`', '')
        .replaceAll('`)', '')
        .replaceAll('&&', '')
        .replaceAll('Path(`', '')
        .replaceAll(' ', '');
      const tlsLabelKey = Object.keys(container.Labels).find(
        (key) => key.startsWith('traefik.http.routers.') && key.endsWith('.tls')
      );
      const isTls = tlsLabelKey ? container.Labels[tlsLabelKey] === 'true' : undefined;
      container.url = `http${isTls ? 's' : ''}://${host}`;
    }

    if (!composedContainersByComposeFileMap.has(composeFile)) {
      composedContainersByComposeFileMap.set(composeFile, []);
    }
    composedContainersByComposeFileMap.get(composeFile)!.push(container);
  }

  const composedContainersByComposeFile = Object.fromEntries(composedContainersByComposeFileMap);

  return {
    composedContainers: composedContainersByComposeFile,
    separateContainers: nonComposedContainers,
    images,
    unusedDockerImages,
  };
};

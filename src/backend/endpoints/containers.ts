import { containerApi } from './container/socket';
import { promises as fs } from 'fs';
import * as path from 'path';

const getUnusedDockerImages = async (containers, images) => {
  const usedImageIds = new Set(containers.map((c: any) => c.ImageID));
  return images
    .filter((img: any) => !usedImageIds.has(img.Id))
    .map((img) => ({ Image: `${img.RepoTags ? img.RepoTags[0] : '<none>'}`, Id: img.Id }));
};

const getComposeFiles = async () => {
  async function findComposeFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    // Run directory/file checks in parallel for better performance
    const promises = entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findComposeFiles(fullPath);
      } else if (entry.isFile() && /^.*compose\.ya?ml$/i.test(entry.name)) {
        return [fullPath.replace(/^\/data\//, '')];
      }
      return [];
    });

    const nestedResults = await Promise.all(promises);
    return nestedResults.flat();
  }

  return await findComposeFiles('/data');
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
  const [images, { containers, composedContainers, nonComposedContainers }, composeFiles] =
    await Promise.all([containerApi.listImages(), getContainersRunningViaCompose(), getComposeFiles()]);

  const unusedDockerImages = await getUnusedDockerImages(containers, images);

  const composedContainersSortedByImage: any = [];
  images.forEach(({ Id }: any) => {
    composedContainers
      .filter((container: any) => container.ImageID === Id)
      .forEach((container: any) => {
        composedContainersSortedByImage.push(container);
      });
  });

  const composedContainersByComposeFileMap = new Map<string, any[]>();
  composedContainersSortedByImage.forEach((container: any) => {
    const configFilesLabel = container.Labels['com.docker.compose.project.config_files'];
    let composeFile = '[unmanaged]';
    if (configFilesLabel) {
      composeFile =
        composeFiles.find((file: string) => configFilesLabel.endsWith(file)) || composeFile;
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
  });

  const composedContainersByComposeFile = Object.fromEntries(composedContainersByComposeFileMap);
  const composedContainersByComposeFileKeys = Array.from(composedContainersByComposeFileMap.keys());

  return {
    composedContainers: composedContainersByComposeFile,
    separateContainers: nonComposedContainers,
    separateComposeFiles: composeFiles.filter(
      (composeFile) => !composedContainersByComposeFileKeys.includes(composeFile)
    ),
    images,
    unusedDockerImages,
  };
};

import path from 'path';

import { getIcon } from '@/backend/utils/icon';
import { createExec } from '@/backend/utils/exec';
import type { Repo } from '@/backend/db/schema/repo';
import { mainLogger } from '@/backend/utils/logger';
import { job as jobDb } from '@/backend/db/job';
import { getTraefikUrl } from '@/backend/utils';

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
  const otherComposedContainersByComposeFileMap = new Map();
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

        const tlsLabelKey = Object.keys(container.Config.Labels).find(
          (key) => key.startsWith('traefik.http.routers.') && key.endsWith('.tls')
        );
        const isTls = tlsLabelKey ? container.Config.Labels[tlsLabelKey] === 'true' : undefined;
        if (!container.urls) container.urls = [];
        container.urls.push(`http${isTls ? 's' : ''}://${getTraefikUrl(ruleLabel)}`);
      });

    const workingFolder = path.join(selectedRepo.workingFolder, '/');
    const relativeComposeFile = composeFile.replace(workingFolder, '');

    const mapToAddTo =
      composeFile.includes(workingFolder) &&
      (!selectedRepo.excludeFolders ||
        !new RegExp(selectedRepo.excludeFolders).test(relativeComposeFile))
        ? composedContainersByComposeFileMap
        : otherComposedContainersByComposeFileMap;

    if (!mapToAddTo.has(relativeComposeFile)) {
      mapToAddTo.set(relativeComposeFile, []);
    }
    mapToAddTo.get(relativeComposeFile).push(container);
  }

  const composedContainersByComposeFileEntries = await Promise.all(
    Array.from(composedContainersByComposeFileMap.entries()).map(
      async ([composeFile, containers]) => {
        const composeFileFolder = composeFile
          .replace(`${selectedRepo.workingFolder}/`, '')
          .split('/');
        composeFileFolder.pop();

        const folder = path.join('/', composeFileFolder.join('/'));
        const jobs = await jobDb.getJobsWithLogs(selectedRepo.id, folder !== '/' ? folder : '');
        return [
          composeFile,
          {
            services: containers,
            jobs,
          },
        ];
      }
    )
  );

  composedContainersByComposeFileEntries.sort((a, b) => {
    const aHasJobs = a[1].jobs && a[1].jobs.length > 0;
    const bHasJobs = b[1].jobs && b[1].jobs.length > 0;

    if (aHasJobs && bHasJobs) {
      return b[1].jobs[0].updated > a[1].jobs[0].updated ? 1 : -1; // Descending order (newest first)
    } else if (aHasJobs) {
      return -1; // a comes before b
    } else if (bHasJobs) {
      return 1; // b comes before a
    } else {
      return 0; // both have no jobs, keep order
    }
  });

  const composedContainersByComposeFile = Object.fromEntries(
    composedContainersByComposeFileEntries
  );

  return {
    composedContainers: composedContainersByComposeFile,
    otherComposedContainers: Object.fromEntries(otherComposedContainersByComposeFileMap),
    separateContainers: nonComposedContainers,
    images,
    unusedDockerImages: await getUnusedDockerImages(containers, images),
  };
};

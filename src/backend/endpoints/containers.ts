import path from 'path';

import { getIcon } from '@/backend/utils/icon';
import { createDockerExec } from '@/backend/utils/docker';
import type { Host } from '@/backend/db/schema/host';
import { mainLogger } from '@/backend/utils/logger';
import { job as jobDb } from '@/backend/db/job';
import { getTraefikUrl } from '@/backend/utils';
import type { JobWithLogs } from '@/backend/db/schema/job';

export type SortOptions = 'updates' | 'uptime' | 'name';

const event = 'containers';
const logger = mainLogger.child({ event });
const dockerExec = createDockerExec(logger);

const getUnusedDockerImages = async (containers, images) => {
  const usedImageIds = new Set(containers.map((container) => container.Image));
  return images.filter((img) => !usedImageIds.has(img.ID));
};

const getGroupedContainersRunning = async (context: string, sort: SortOptions) => {
  const containers = await dockerExec.listContainers(context);
  if (sort === 'name') containers.sort((a, b) => a.Name.localeCompare(b.Name));

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

const enrichJobsWithComposeFile = (
  jobs: JobWithLogs[],
  composedContainers: Record<string, any>
) => {
  return jobs.map((job) => {
    const composeFile = Object.keys(composedContainers).find((file) => {
      const compose = file.split('/').slice(0, -1).join('/');
      return job.folder.endsWith(compose);
    });
    return {
      ...job,
      composeFile,
    };
  });
};

export const getContainers = async (selectedHost: Host, sort: SortOptions = 'updates') => {
  const [images, { containers, composedContainers, nonComposedContainers }] = await Promise.all([
    dockerExec.listImages(selectedHost.name),
    getGroupedContainersRunning(selectedHost.name, sort),
  ]);

  const composeFiles = new Set();
  const composedContainersByComposeFileMap = new Map();
  const otherComposedContainersByComposeFileMap = new Map();
  for (const container of composedContainers) {
    getIcon(container.Config.Labels['com.docker.compose.service']);

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

    const workingFolder = path.join(selectedHost.workingFolder, '/');
    const relativeComposeFile = workingFolder
      ? composeFile.replace(workingFolder, '')
      : composeFile;

    const mapToAddTo =
      composeFile.includes(workingFolder) &&
      (!selectedHost.excludeFolders ||
        !new RegExp(selectedHost.excludeFolders).test(relativeComposeFile))
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
        const composeFileFolder = selectedHost.workingFolder
          ? composeFile.replace(`${selectedHost.workingFolder}/`, '').split('/')
          : composeFile.split('/');
        composeFileFolder.pop();

        const folder = path.join('/', composeFileFolder.join('/'));
        const jobs = await jobDb.getJobsWithLogs(selectedHost.id, folder);
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

  if (sort === 'updates') {
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
  }

  if (sort === 'name') {
    composedContainersByComposeFileEntries.sort();
  }

  const composedContainersByComposeFile = Object.fromEntries(
    composedContainersByComposeFileEntries
  );

  return {
    composedContainers: composedContainersByComposeFile as Record<
      string,
      { services: Array<{ Name: string; Image: string; Config: { Image: string } }> }
    >,
    otherComposedContainers: Object.fromEntries(otherComposedContainersByComposeFileMap),
    separateContainers: nonComposedContainers,
    images,
    unusedDockerImages: await getUnusedDockerImages(containers, images),
    incompleteJobs: enrichJobsWithComposeFile(
      await jobDb.getIncompleteJobs(selectedHost.id),
      composedContainersByComposeFile
    ),
  };
};

import * as path from 'path';

import { mainLogger, getLogs } from '@/backend/utils/logger';
import type { Repo } from '@/backend/db/repo';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';
import { createExec } from '@/backend/utils/exec';
import type { Logger } from 'pino';
import { log as logDb } from '@/backend/db/log';
import { job as jobDb } from '@/backend/db/job';

export const baseEvent = 'github-webhook';

export type GitHubWebhookEvent = {
  repo?: string;
  number: number;
  action: string;
  merged: string;
  title: string;
  sender: string;
};

const fileExcluded = (file: string, excludeFolders: string | null): boolean => {
  if (!excludeFolders || excludeFolders === 'null') return false;
  const regex = new RegExp(excludeFolders);
  return regex.test(file);
};

const pullRestartUpdatedContainers = async (folder: string, repoConfig: Repo, logger: Logger) => {
  const { workingFolder, excludeFolders, name, sshCmd: host } = repoConfig;

  const exec = createExec(logger);

  const composePullDownUp = async (host: string, composeFile: string) => {
    logger.info(`Pulling images for compose file: ${composeFile}`);
    await exec.sshRun(host, `docker compose -f ${composeFile} pull`);
    logger.info(`Stopping and removing containers for compose file: ${composeFile}`);
    await exec.sshRun(host, `docker compose -f ${composeFile} down`);
    logger.info(`Starting containers for compose file: ${composeFile}`);
    await exec.sshRun(host, `docker compose -f ${composeFile} up -d`);
  };

  await exec.sshRun(host, `cd ${workingFolder} && git pull --prune`);

  const file = path.join(workingFolder, folder, 'docker-compose.yml');
  const { stdout: fileExists } = await exec.sshRun(
    host,
    `test -f "${file}" && echo exists || echo missing`
  );
  if (fileExists === 'exists') {
    if (!fileExcluded(file, excludeFolders)) {
      await composePullDownUp(name, file);
    } else {
      logger.info(`docker-compose.yml file excluded: ${file}`);
    }
  } else {
    // Single Dependabot watch (via git diff)
    const { stdout: changedFilesStdout } = await exec.sshRun(
      host,
      `cd ${workingFolder} && git diff --name-only HEAD~1 HEAD`
    );
    const changedFiles = changedFilesStdout.split('\n').filter(Boolean);
    if (changedFiles.some((f) => f.endsWith('docker-compose.yml'))) {
      for (const changedFile of changedFiles) {
        if (
          changedFile.endsWith('docker-compose.yml') &&
          !fileExcluded(changedFile, excludeFolders)
        ) {
          await composePullDownUp(name, changedFile);
        }
      }
    } else {
      logger.info('No docker-compose.yml files have been changed');
    }
  }
};

export const githubWebhookHandler = async (webhookEvent: GitHubWebhookEvent, repoConfig: Repo) => {
  const { action, merged, title, number, sender } = webhookEvent;

  // Extract folder from title (like sed -E 's/.* in (.*)/\1/')
  const folderMatch = title.match(/ in (.*)/);
  const folder = folderMatch ? folderMatch[1] : '';

  const event = `${baseEvent} ${repoConfig.name} ${folder}`;
  const logger = mainLogger.child({ event });

  let containersCleanupLogs;
  const jobData = {
    repoId: repoConfig.id,
    repoPr: `${repoConfig.repo}#${number}`,
    folder,
    title,
  };
  let jobId;
  if (!repoConfig.workingFolder || action !== 'closed' || !merged || !title) {
    if (sender === 'dependabot[bot]') {
      jobId = await jobDb.upsert({ ...jobData, status: 'opened' });
    }
    logger.info(
      `No action required for workingFolder: '${repoConfig.workingFolder}' action: '${action}' merged: '${merged}' title: '${title}'`
    );
  } else {
    jobId = await jobDb.upsert({ ...jobData, status: 'running' });
    try {
      await pullRestartUpdatedContainers(folder, repoConfig, logger);
      containersCleanupLogs = await containersCleanup(repoConfig.name);
      jobId = await jobDb.upsert({ ...jobData, status: 'completed' });
    } catch (err: any) {
      jobId = await jobDb.upsert({ ...jobData, status: 'failed' });
    }
  }

  // save logs
  [getLogs(event), containersCleanupLogs]
    .filter(Boolean)
    .flat()
    .forEach((log) => {
      logDb.create({ jobId, repo: repoConfig.repo, ...log });
    });
};

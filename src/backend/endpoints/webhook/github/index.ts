import * as path from 'path';

import { mainLogger, getLogs } from '@/backend/utils/logger';
import { type Host } from '@/backend/db/schema/host';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';
import { createExec } from '@/backend/utils/exec';
import type { Logger } from 'pino';
import { log as logDb } from '@/backend/db/log';
import { job as jobDb } from '@/backend/db/job';
import { isComposeFilename, waitASecond } from '@/backend/utils';
import { JobStatus } from '@/backend/db/schema/job';
import { sendNotification } from '@/backend/utils/notification';

export const baseEvent = 'github-webhook';
const composeFilename = process.env.COMPOSE_FILENAME || 'compose.yml';

export type GitHubWebhookEvent = {
  repo?: string;
  number: number;
  action: string;
  merged: string;
  title: string;
  body: string;
  sender: string;
  url: string;
};

const fileExcluded = (file: string, excludeFolders: string | null): boolean => {
  if (!excludeFolders || excludeFolders === 'null') return false;
  const regex = new RegExp(excludeFolders);
  return regex.test(file);
};

const pullRestartUpdatedContainers = async (folder: string, repoConfig: Host, logger: Logger) => {
  const { workingFolder, excludeFolders, name, sshHost: host } = repoConfig;

  const exec = createExec(logger);

  const composePullDownUp = async (composeFile: string) => {
    logger.info(`Pulling images for compose file: ${composeFile}`);
    await exec.sshRun(name, host, `docker compose -f '${composeFile}' pull`);

    if (composeFile.includes('containers-up')) {
      logger.info(
        `Restarting containers-up with new images via nohup for compose file: ${composeFile}`
      );
      await exec.sshRun(
        name,
        host,
        `nohup bash -c "docker compose -f '${composeFile}' down && docker compose -f '${composeFile}' up -d" >> /tmp/containers-up.log 2>&1 &`
      );
    } else {
      logger.info(`Stopping and removing containers for compose file: ${composeFile}`);
      await exec.sshRun(name, host, `docker compose -f '${composeFile}' down`);
      logger.info(`Starting containers for compose file: ${composeFile}`);
      await exec.sshRun(name, host, `docker compose -f '${composeFile}' up -d`);
    }
  };

  await exec.sshRun(name, host, `cd ${workingFolder} && git pull --prune`);

  const file = path.join(workingFolder, folder, composeFilename);
  const { stdout: fileExists } = await exec.sshRun(
    name,
    host,
    `test -f "${file}" && echo exists || echo missing`
  );
  if (fileExists === 'exists') {
    if (!fileExcluded(file, excludeFolders)) {
      await composePullDownUp(file);
    } else {
      logger.info(`Compose file excluded: ${file}`);
    }
  } else {
    // Single Dependabot watch (via git diff)
    const { stdout: changedFilesStdout } = await exec.sshRun(
      name,
      host,
      `cd ${workingFolder} && git diff --name-only HEAD~1 HEAD`
    );
    const changedFiles = changedFilesStdout.split('\n').filter(Boolean);
    if (changedFiles.some((f) => isComposeFilename(f))) {
      for (const changedFile of changedFiles) {
        if (isComposeFilename(changedFile) && !fileExcluded(changedFile, excludeFolders)) {
          await composePullDownUp(changedFile);
        }
      }
    } else {
      logger.info('No compose YAML files have been changed');
    }
  }
};

export const githubWebhookHandler = async (webhookEvent: GitHubWebhookEvent, hostConfig: Host) => {
  const { action, merged, title, number, sender, body } = webhookEvent;

  // Extract folder from title (like sed -E 's/.* in (.*)/\1/')
  const folderMatch = title.match(/ in (.*)/);
  const folder = folderMatch ? folderMatch[1] : '';

  const event = `${baseEvent} ${hostConfig.name} ${folder}`;
  const logger = mainLogger.child({ event });

  const jobData = {
    hostId: hostConfig.id,
    repoPr: `${hostConfig.repo}#${number}`,
    folder,
    title,
  };

  logger.info(
    jobData,
    `Received GitHub webhook: action='${action}' merged='${merged}' title='${title}'`
  );

  let runningJobs = await jobDb.getRunningJobs(hostConfig.id);
  if (runningJobs.length > 0) {
    logger.info(`Waiting up to 5 minutes for running jobs to complete`);
    await jobDb.upsert({ ...jobData, status: JobStatus.queued });
    const maxWaits = 60 * 5;
    let waitCount = 0;
    while (waitCount < maxWaits) {
      await waitASecond();
      runningJobs = await jobDb.getRunningJobs(hostConfig.id);
      if (runningJobs.length === 0) {
        logger.info(`Running jobs completed after ${waitCount} seconds, continuing...`);
        break;
      }
      waitCount++;
    }

    if (runningJobs.length !== 0) {
      logger.error(`Job cancelled: Waited 5 minutes for running jobs to complete`);
      await jobDb.upsert({ ...jobData, status: JobStatus.failed });
      return;
    }
  }

  let containersCleanupLogs;
  let jobId: number;
  if (!hostConfig.workingFolder || action !== 'closed' || !title) {
    if (sender === 'dependabot[bot]' && action === 'opened') {
      jobId = await jobDb.upsert({ ...jobData, status: JobStatus.open });

      sendNotification({
        hostName: hostConfig.name,
        subject: `${title} on ${hostConfig.name}`,
        message: `${body}\n\n${webhookEvent.url}`,
      });
    }

    logger.info(
      `No action required for workingFolder: '${hostConfig.workingFolder}' action: '${action}' merged: '${merged}' title: '${title}'`
    );
  } else if (merged && action === 'closed') {
    jobId = await jobDb.upsert({ ...jobData, status: JobStatus.running });
    try {
      await pullRestartUpdatedContainers(folder, hostConfig, logger);
      containersCleanupLogs = await containersCleanup(hostConfig.name);
      jobId = await jobDb.upsert({ ...jobData, status: JobStatus.completed });
    } catch (err: any) {
      jobId = await jobDb.upsert({ ...jobData, status: JobStatus.failed });
    }
  } else if (action === 'closed') {
    jobId = await jobDb.upsert({ ...jobData, status: JobStatus.closed });
  } else {
    logger.error({ action, merged, jobData }, 'Unknown webhook event');
    return;
  }

  // save logs
  [getLogs(event), containersCleanupLogs]
    .filter(Boolean)
    .flat()
    .forEach(async (log) => {
      await logDb.create({ jobId, hostId: hostConfig.id, ...log });
    });
};

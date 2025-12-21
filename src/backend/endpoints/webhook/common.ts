import { job as jobDb } from '@/backend/db/job';
import { log as logDb } from '@/backend/db/log';
import type { Host } from '@/backend/db/schema/host';
import { JobStatus } from '@/backend/db/schema/job';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';
import { pullRestartUpdatedContainers } from '@/backend/endpoints/webhook/pull-restart';
import { waitASecond } from '@/backend/utils';
import { getLogs, mainLogger } from '@/backend/utils/logger';
import { sendNotification } from '@/backend/utils/notification';

export type WebhookEvent = {
  repo?: string;
  number: number;
  action: string;
  merged: boolean | string;
  title: string;
  body?: string;
  labels?: { name: string }[];
  sender: string;
  url?: string;
};

type WebhookHandlerOptions = {
  eventName: string;
  folder?: string | null;
};

export const commonWebhookHandler = async (
  webhookEvent: WebhookEvent,
  hostConfig: Host,
  options: WebhookHandlerOptions
) => {
  const { action, merged, title, number, body } = webhookEvent;
  const { eventName, folder } = options;

  const botKeyword = hostConfig.botType === 'renovate' ? 'renovate' : 'dependabot';
  const isBot = body?.toLowerCase().includes(botKeyword) ?? false;

  const event = `${eventName} ${hostConfig.name} ${folder || 'auto'}`;
  const logger = mainLogger.child({ event });

  const jobData = {
    hostId: hostConfig.id,
    repoPr: `${hostConfig.repo}#${number}`,
    folder: folder || '',
    title,
  };

  logger.info(
    jobData,
    `Received ${eventName}: action='${action}' merged='${merged}' title='${title}'`
  );

  const maxWaitTimeMinutes = parseInt(process.env.MAX_QUEUE_TIME_MINS || '10', 10);
  let runningJobs = await jobDb.getRunningJobs(hostConfig.id);
  if (runningJobs.length > 0) {
    logger.info(`Waiting up to ${maxWaitTimeMinutes} minutes for running jobs to complete`);
    await jobDb.upsert({ ...jobData, status: JobStatus.queued });
    const maxWaits = 60 * maxWaitTimeMinutes;
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
      logger.error(
        `Job cancelled: Waited ${maxWaitTimeMinutes} minutes for running jobs to complete`
      );
      await jobDb.upsert({ ...jobData, status: JobStatus.failed });
      return;
    }
  }

  let containersCleanupLogs;
  let jobId: number;

  if (action === 'opened') {
    if (isBot) {
      jobId = await jobDb.upsert({ ...jobData, status: JobStatus.open });

      sendNotification({
        hostName: hostConfig.name,
        subject: `${title} on ${hostConfig.name}`,
        message: `${body}\n\n${webhookEvent.url}`,
      });
    } else {
      logger.info(
        `No action required for workingFolder: '${hostConfig.workingFolder}' action: '${action}' merged: '${merged}' title: '${title}'`
      );
    }
  } else if (action === 'closed') {
    // Check if we have a tracking job for this PR
    const existingJob = await jobDb.getByRepoPrTitle(
      hostConfig.repoHost,
      jobData.repoPr,
      jobData.title
    );
    if (!existingJob) {
      logger.info(`No job found for title: '${title}', skipping event`);
      return;
    }

    if (merged) {
      jobId = await jobDb.upsert({ ...jobData, status: JobStatus.running });
      try {
        await pullRestartUpdatedContainers(folder, hostConfig, logger);
        containersCleanupLogs = await containersCleanup(hostConfig.name);
        jobId = await jobDb.upsert({ ...jobData, status: JobStatus.completed });
      } catch {
        jobId = await jobDb.upsert({ ...jobData, status: JobStatus.failed });
      }
    } else {
      jobId = await jobDb.upsert({ ...jobData, status: JobStatus.closed });
    }
  }

  // save logs
  [getLogs(event), containersCleanupLogs]
    .filter(Boolean)
    .flat()
    .forEach(async (log) => {
      await logDb.create({ jobId, hostId: hostConfig.id, ...log });
    });
};

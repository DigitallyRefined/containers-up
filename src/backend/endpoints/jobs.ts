import { host as hostDb } from '@/backend/db/host';
import { job as jobDb } from '@/backend/db/job';
import { commonWebhookHandler } from '@/backend/endpoints/webhook/common';

export const restartJob = async (id: string) => {
  const job = await jobDb.get(id);
  if (!job) throw new Error('Job not found');

  const { hostId, folder, source, title } = job;

  const repoConfig = await hostDb.get(hostId);
  if (!repoConfig) throw new Error('Host not found');

  await commonWebhookHandler(
    {
      number: parseInt(source.split('#')[1], 10),
      action: 'closed',
      merged: 'true',
      title,
    },
    repoConfig,
    {
      eventName: 'manual-restart',
      folder,
    }
  );

  return await jobDb.getJobsWithLogs(hostId, folder);
};

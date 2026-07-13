import { host as hostDb } from '@/backend/db/host';
import { job as jobDb } from '@/backend/db/job';
import { commonWebhookHandler } from '@/backend/endpoints/webhook/common';

export const restartJob = async (id: string) => {
  const { hostId, folder, source, title } = await jobDb.get(id);

  const repoConfig = await hostDb.get(hostId);

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

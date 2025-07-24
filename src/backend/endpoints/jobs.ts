import { job as jobDb } from '@/backend/db/job';
import { githubWebhookHandler } from '@/backend/endpoints/webhook/github';
import { host as hostDb } from '@/backend/db/host';

export const restartJob = async (id: string) => {
  const { hostId, folder, repoPr, title } = await jobDb.get(id);

  const repoConfig = await hostDb.get(hostId);

  await githubWebhookHandler(
    {
      number: parseInt(repoPr.split('#')[1]),
      action: 'closed',
      merged: 'true',
      title,
      sender: null,
    },
    repoConfig
  );

  return await jobDb.getJobsWithLogs(hostId, folder);
};

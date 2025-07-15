import { job as jobDb } from '@/backend/db/job';
import { githubWebhookHandler } from '@/backend/endpoints/webhook/github';
import { repo as repoDb } from '@/backend/db/repo';

export const restartJob = async (id: string) => {
  const { repoId, folder, repoPr, title } = await jobDb.get(id);

  const repoConfig = await repoDb.get(repoId);

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

  return await jobDb.getJobsWithLogs(repoId, folder);
};

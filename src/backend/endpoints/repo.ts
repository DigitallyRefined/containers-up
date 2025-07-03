import { Repo, repo as repoDb } from '@/backend/db/repo';

export const getRepos = async () => {
  return await repoDb.getAll();
};

export const postRepo = async (repo: Repo) => {
  await repoDb.create(repo);

  return 'ok';
};

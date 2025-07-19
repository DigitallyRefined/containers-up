import { getDb, upsert } from '@/backend/db/connection';
import { Repo, repoCreateTableSql } from '@/backend/db/schema/repo';

export const repo = {
  get: async (id: number) => {
    const db = await getDb();

    return db.query(`SELECT * FROM repo WHERE id=$id`).as(Repo).get({ id });
  },
  getAll: async () => {
    const db = await getDb();

    try {
      return db.query(`SELECT * FROM repo`).as(Repo).all();
    } catch (error) {
      return [];
    }
  },
  getByName: async (name: string) => {
    const db = await getDb();

    return db.query(`SELECT * FROM repo WHERE name=$name`).as(Repo).get({ name });
  },
  getAllByRepo: async (repo: string) => {
    const db = await getDb();

    return db.query(`SELECT * FROM repo WHERE repo=$repo`).as(Repo).all({ repo });
  },
  upsert: async ({
    id,
    name,
    sshCmd,
    repo,
    webhookSecret,
    workingFolder,
    excludeFolders,
  }: Repo) => {
    const db = await getDb();

    db.query(repoCreateTableSql).run();

    const data = {
      id,
      name,
      sshCmd,
      repo,
      webhookSecret,
      workingFolder,
      excludeFolders: excludeFolders || '',
    };

    return upsert({ table: 'repo', data, conflictKey: 'id' });
  },
  delete: async (id: number) => {
    const db = await getDb();

    return db.query(`DELETE FROM repo WHERE id=$id`).run({ id });
  },
};

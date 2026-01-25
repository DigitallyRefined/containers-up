import { getDb, upsert } from '@/backend/db/connection';
import { Host, hostCreateTableSql } from '@/backend/db/schema/host';

const defaultSortOrder = 'ORDER BY sortOrder ASC NULLS LAST, name ASC';

export const host = {
  get: async (id: number) => {
    const db = await getDb();

    return db.query(`SELECT * FROM host WHERE id=$id ${defaultSortOrder}`).as(Host).get({ id });
  },
  getAll: async () => {
    const db = await getDb();

    try {
      return db.query(`SELECT * FROM host ${defaultSortOrder}`).as(Host).all();
    } catch {
      return [];
    }
  },
  getByName: async (name: string) => {
    const db = await getDb();

    db.query(hostCreateTableSql).run();

    return db
      .query(`SELECT * FROM host WHERE name=$name ${defaultSortOrder}`)
      .as(Host)
      .get({ name });
  },
  getByRepoAndHost: async (repoHost: string, repo: string) => {
    const db = await getDb();

    return db
      .query(`SELECT * FROM host WHERE repoHost=$repoHost AND repo=$repo`)
      .as(Host)
      .get({ repoHost, repo });
  },
  upsert: async ({
    id,
    name,
    sshHost,
    repoHost,
    repo,
    botType,
    webhookSecret,
    workingFolder,
    excludeFolders,
    cron,
    squashUpdates,
    sortOrder,
  }: Host) => {
    const data = {
      id,
      name,
      sshHost,
      repoHost,
      repo,
      botType,
      webhookSecret,
      workingFolder,
      excludeFolders: excludeFolders || '',
      cron,
      squashUpdates: squashUpdates ? 1 : 0,
      sortOrder,
    };

    if (!webhookSecret) {
      delete data.webhookSecret;
    }

    return upsert({ table: 'host', data, conflictKey: 'id' });
  },
  delete: async (id: number) => {
    const db = await getDb();

    return db.query(`DELETE FROM host WHERE id=$id`).run({ id });
  },
};

import { getDb, upsert } from '@/backend/db/connection';
import { Host, hostCreateTableSql } from '@/backend/db/schema/host';

export const host = {
  get: async (id: number) => {
    const db = await getDb();

    return db.query(`SELECT * FROM host WHERE id=$id`).as(Host).get({ id });
  },
  getAll: async () => {
    const db = await getDb();

    try {
      return db.query(`SELECT * FROM host`).as(Host).all();
    } catch (error) {
      return [];
    }
  },
  getByName: async (name: string) => {
    const db = await getDb();

    db.query(hostCreateTableSql).run();

    return db.query(`SELECT * FROM host WHERE name=$name`).as(Host).get({ name });
  },
  getAllByRepo: async (repo: string) => {
    const db = await getDb();

    return db.query(`SELECT * FROM host WHERE repo=$repo`).as(Host).all({ repo });
  },
  upsert: async ({
    id,
    name,
    sshHost,
    repo,
    webhookSecret,
    workingFolder,
    excludeFolders,
    cron,
  }: Host) => {
    const data = {
      id,
      name,
      sshHost,
      repo,
      webhookSecret,
      workingFolder,
      excludeFolders: excludeFolders || '',
      cron,
    };

    return upsert({ table: 'host', data, conflictKey: 'id' });
  },
  delete: async (id: number) => {
    const db = await getDb();

    return db.query(`DELETE FROM host WHERE id=$id`).run({ id });
  },
};

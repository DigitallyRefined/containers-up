import { getDb, upsert } from '@/backend/db/connection';

export class Repo {
  id?: number;
  name: string;
  sshCmd: string;
  repo: string;
  webhookSecret: string;
  workingFolder: string;
  excludeFolders?: string;
  created?: string;
}

export const repo = {
  get: async (id: number) => {
    const db = await getDb();

    return db.query(`SELECT * FROM repo WHERE id=$id`).as(Repo).get({ id });
  },
  getAll: async () => {
    const db = await getDb();

    return db.query(`SELECT * FROM repo`).as(Repo).all();
  },
  getByName: async (name: string) => {
    const db = await getDb();

    return db.query(`SELECT * FROM repo WHERE name=$name`).as(Repo).get({ name });
  },
  getAllByRepo: async (repo: string) => {
    const db = await getDb();

    return db.query(`SELECT * FROM repo WHERE repo=$repo`).as(Repo).all({ repo });
  },
  create: async ({ name, sshCmd, repo, webhookSecret, workingFolder, excludeFolders }: Repo) => {
    const db = await getDb();

    db.query(
      `
      CREATE TABLE IF NOT EXISTS repo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sshCmd TEXT NOT NULL,
        repo TEXT NOT NULL UNIQUE,
        webhookSecret TEXT NOT NULL,
        workingFolder TEXT NOT NULL,
        excludeFolders TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `
    ).run();

    const data = {
      name,
      sshCmd,
      repo,
      webhookSecret,
      workingFolder,
      excludeFolders: excludeFolders || '',
    };

    return upsert({ table: 'repo', data, conflictKey: 'name' });
  },
};

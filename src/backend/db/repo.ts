import { getDb, upsert } from './connection';

export class Repo {
  id: number;
  name: string;
  sshCmd: string;
  repo: string;
  workingFolder: string;
  excludeFolders?: string;
  created: string;
}

export const repo = {
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
  create: async ({ name, sshCmd, repo, workingFolder, excludeFolders }: Repo) => {
    const db = await getDb();

    db.query(
      `
      CREATE TABLE IF NOT EXISTS repo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sshCmd TEXT NOT NULL,
        repo TEXT NOT NULL UNIQUE,
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
      workingFolder,
      excludeFolders: excludeFolders || '',
    };
    console.log(data);

    return upsert({ table: 'repo', data, conflictKey: 'name' });
  },
};

import { getDb, upsert } from '@/backend/db/connection';
import { getDatetime } from '@/backend/utils';
import { log as logDb, type Log } from '@/backend/db/log';

export class Job {
  id?: number;
  repoId: number;
  repoPr: string;
  folder: string;
  title: string;
  status: string;
  created?: number;
  updated?: number;
}

export class JobWithLogs extends Job {
  logs: Log[];
}

export const job = {
  upsert: async ({ repoId, repoPr, folder, title, status }: Job) => {
    const db = await getDb();

    db.query(
      `CREATE TABLE IF NOT EXISTS job (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repoId INTEGER NOT NULL,
        repoPr TEXT NOT NULL UNIQUE,
        folder TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();

    const data = { repoId, repoPr, folder, title, status, updated: getDatetime() };
    await upsert({ table: 'job', data, conflictKey: 'repoPr' });

    // Query for the id of the row with the given repoPr
    const row = db.query('SELECT id FROM job WHERE repoPr = $repoPr').as(Job).get({ repoPr });
    return row ? row.id : undefined;
  },
  get: async (id: string) => {
    const db = await getDb();
    return db.query('SELECT * FROM job WHERE id = $id').as(Job).get({ id });
  },
  getJobsWithLogs: async (repoId: number, folder?: string) => {
    const db = await getDb();
    const hasFolder = folder !== undefined;

    const jobs = db
      .query(
        `SELECT * FROM job WHERE repoId = $repoId ${
          hasFolder ? `AND folder = $folder` : ''
        } ORDER BY updated DESC LIMIT 50`
      )
      .as(JobWithLogs)
      .all({ repoId, ...(hasFolder ? { folder } : {}) });

    // For each job, get logs
    for (const job of jobs) {
      job.logs = await logDb.get(job.id);
    }
    return jobs;
  },
  getRunningJobs: async (repoId: number) => {
    const db = await getDb();
    return db
      .query('SELECT * FROM job WHERE repoId = $repoId AND status = "running"')
      .as(Job)
      .all({ repoId });
  },
};

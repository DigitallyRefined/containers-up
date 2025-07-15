import { getDb, upsert } from '@/backend/db/connection';
import { getDatetime } from '@/backend/utils';
import { Log } from '@/backend/db/log';

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
  getJobsWithLogs: async (repoId: number, folder: string) => {
    const db = await getDb();

    // Get up to 10 jobs
    const jobs = db
      .query('SELECT * FROM job WHERE repoId = $repoId AND folder = $folder ORDER BY created DESC LIMIT 10')
      .as(JobWithLogs)
      .all({ repoId, folder });

    // For each job, get up to 20 logs
    for (const job of jobs) {
      job.logs = db
        .query('SELECT * FROM log WHERE jobId = $jobId ORDER BY time DESC LIMIT 20')
        .as(Log)
        .all({ jobId: job.id });
    }
    return jobs;
  },
};

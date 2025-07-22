import { getDb, upsert } from '@/backend/db/connection';
import { getDatetime } from '@/backend/utils';
import { log as logDb } from '@/backend/db/log';
import { Job, JobStatus, JobWithLogs, jobCreateTableSql } from '@/backend/db/schema/job';

const addLogsToJobs = async (jobs: JobWithLogs[]) => {
  // For each job, get logs
  for (const job of jobs) {
    job.logs = await logDb.get(job.id);
  }
  return jobs;
};

export const job = {
  upsert: async ({ repoId, repoPr, folder, title, status }: Job) => {
    const db = await getDb();

    db.query(jobCreateTableSql).run();

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
        } ORDER BY status, updated DESC LIMIT 50`
      )
      .as(JobWithLogs)
      .all({ repoId, ...(hasFolder ? { folder } : {}) });

    return addLogsToJobs(jobs);
  },
  getIncompleteJobs: async (repoId: number) => {
    const db = await getDb();
    const jobs = db
      .query(
        `SELECT * FROM job WHERE repoId = $repoId AND status != ${JobStatus.completed} ORDER BY status, updated DESC LIMIT 50`
      )
      .as(JobWithLogs)
      .all({ repoId });

    return addLogsToJobs(jobs);
  },
  getRunningJobs: async (repoId: number) => {
    const db = await getDb();
    return db
      .query(`SELECT * FROM job WHERE repoId = $repoId AND status = ${JobStatus.running}`)
      .as(Job)
      .all({ repoId });
  },
};

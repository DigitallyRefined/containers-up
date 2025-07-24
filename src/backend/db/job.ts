import { getDb, upsert } from '@/backend/db/connection';
import { getDatetime } from '@/backend/utils';
import { log as logDb } from '@/backend/db/log';
import { Job, JobStatus, JobWithLogs, jobCreateTableSql } from '@/backend/db/schema/job';

const addLogsToJobs = async (jobs: JobWithLogs[]) => {
  for (const job of jobs) {
    job.logs = await logDb.get(job.id);
  }
  return jobs;
};

export const job = {
  upsert: async ({ hostId, repoPr, folder, title, status }: Job) => {
    const db = await getDb();

    db.query(jobCreateTableSql).run();

    const data = { hostId, repoPr, folder, title, status, updated: getDatetime() };
    await upsert({ table: 'job', data, conflictKey: 'repoPr' });

    const row = db.query('SELECT id FROM job WHERE repoPr = $repoPr').as(Job).get({ repoPr });
    return row ? row.id : undefined;
  },
  get: async (id: string) => {
    const db = await getDb();
    return db.query('SELECT * FROM job WHERE id = $id').as(Job).get({ id });
  },
  getJobsWithLogs: async (hostId: number, folder?: string) => {
    const db = await getDb();
    const hasFolder = folder !== undefined;

    db.query(jobCreateTableSql).run();

    const jobs = db
      .query(
        `SELECT * FROM job WHERE hostId = $hostId ${
          hasFolder ? `AND folder = $folder` : ''
        } ORDER BY status, updated DESC LIMIT 50`
      )
      .as(JobWithLogs)
      .all({ hostId, ...(hasFolder ? { folder } : {}) });

    return addLogsToJobs(jobs);
  },
  getIncompleteJobs: async (hostId: number) => {
    const db = await getDb();
    const jobs = db
      .query(
        `SELECT * FROM job WHERE hostId = $hostId AND status != ${JobStatus.completed} ORDER BY status, updated DESC LIMIT 50`
      )
      .as(JobWithLogs)
      .all({ hostId });

    return addLogsToJobs(jobs);
  },
  getRunningJobs: async (hostId: number) => {
    const db = await getDb();
    return db
      .query(`SELECT * FROM job WHERE hostId = $hostId AND status = ${JobStatus.running}`)
      .as(Job)
      .all({ hostId });
  },
};

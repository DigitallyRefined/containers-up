import { getDb, upsert } from '@/backend/db/connection';
import { log as logDb } from '@/backend/db/log';
import { Job, JobStatus, JobWithLogs, jobCreateTableSql } from '@/backend/db/schema/job';
import { getDatetime } from '@/backend/utils';

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

    const data = {
      hostId,
      repoPr,
      folder: folder !== '/' ? folder : '',
      title,
      status,
      updated: getDatetime(),
    };
    await upsert({ table: 'job', data, conflictKey: ['hostId', 'title'] });

    const row = db.query('SELECT id FROM job WHERE title = $title').as(Job).get({ title });
    return row ? row.id : undefined;
  },
  get: async (id: string) => {
    const db = await getDb();
    return db.query('SELECT * FROM job WHERE id = $id').as(Job).get({ id });
  },
  getByRepoPr: async (hostId: number, repoPr: string) => {
    const db = await getDb();
    return db
      .query(
        'SELECT job.* FROM job INNER JOIN host ON job.hostId = host.id WHERE host.id = $hostId AND job.repoPr = $repoPr'
      )
      .as(Job)
      .get({ hostId, repoPr });
  },
  getJobsWithLogs: async (hostId: number, folder?: string) => {
    const db = await getDb();
    const hasFolder = folder !== undefined;

    db.query(jobCreateTableSql).run();

    const jobs = db
      .query(
        `SELECT * FROM job WHERE hostId = $hostId ${
          hasFolder ? `AND folder = $folder` : ''
        } ORDER BY updated DESC LIMIT 6`
      )
      .as(JobWithLogs)
      .all({ hostId, ...(hasFolder ? { folder: folder !== '/' ? folder : '' } : {}) });

    return addLogsToJobs(jobs);
  },
  getIncompleteJobs: async (hostId: number) => {
    const db = await getDb();
    const jobs = db
      .query(
        `SELECT * FROM job WHERE hostId = $hostId AND status != ${JobStatus.completed} AND status != ${JobStatus.closed} ORDER BY status, updated DESC LIMIT 50`
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
  markJobAsComplete: async (id: string) => {
    const db = await getDb();
    return db.query(`UPDATE job SET status = ${JobStatus.completed} WHERE id = $id`).run({ id });
  },
};

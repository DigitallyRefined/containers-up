import { getDb } from '@/backend/db/connection';
import { getDatetime } from '@/backend/utils';

export class Log {
  id?: number;
  jobId?: number;
  repo: string;
  level: number;
  time: number;
  event: string;
  msg: string;
}

export const log = {
  create: async ({ jobId, repo, level, time, event, msg }: Log) => {
    const db = await getDb();

    db.query(
      `
      CREATE TABLE IF NOT EXISTS log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jobId INTEGER,
        repo TEXT NOT NULL,
        level INTEGER NOT NULL,
        time INTEGER NOT NULL,
        event TEXT NOT NULL,
        msg TEXT NOT NULL
      )`
    ).run();

    db.query(
      `INSERT INTO log (jobId, repo, level, time, event, msg) VALUES ($jobId, $repo, $level, $time, $event, $msg)`
    ).run({ jobId, repo, level, time: getDatetime(time), event, msg });
  },
  get: async (jobId?: number) => {
    const db = await getDb();
    return db
      .query(`SELECT * FROM log ${jobId ? `WHERE jobId = $jobId` : ''} ORDER BY time DESC LIMIT 20`)
      .as(Log)
      .all(jobId ? { jobId } : undefined);
  },
};

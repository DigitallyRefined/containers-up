import { getDb } from '@/backend/db/connection';
import { getDatetime } from '@/backend/utils';
import { Log, logCreateTableSql } from '@/backend/db/schema/log';

export const log = {
  create: async ({ jobId, repo, level, time, event, msg }: Log) => {
    const db = await getDb();

    db.query(logCreateTableSql).run();

    db.query(
      `INSERT INTO log (jobId, repo, level, time, event, msg) VALUES ($jobId, $repo, $level, $time, $event, $msg)`
    ).run({ jobId, repo, level, time: getDatetime(time), event, msg });
  },
  get: async (jobId?: number) => {
    const db = await getDb();
    return db
      .query(`SELECT * FROM log ${jobId ? `WHERE jobId = $jobId` : ''} ORDER BY time DESC LIMIT 50`)
      .as(Log)
      .all(jobId ? { jobId } : undefined);
  },
  getByRepo: async (repo: string) => {
    const db = await getDb();
    return db
      .query(`SELECT * FROM log WHERE repo = $repo ORDER BY time DESC LIMIT 50`)
      .as(Log)
      .all({ repo });
  },
};

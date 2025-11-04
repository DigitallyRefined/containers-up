import { getDb } from '@/backend/db/connection';
import { Log, logCreateTableSql } from '@/backend/db/schema/log';
import { getDatetime } from '@/backend/utils';

export const log = {
  create: async ({
    jobId,
    hostId,
    level,
    time,
    event,
    msg,
  }: Omit<Log, 'time'> & { time: number }) => {
    const db = await getDb();

    db.query(logCreateTableSql).run();

    db.query(
      `INSERT INTO log (jobId, hostId, level, time, event, msg) VALUES ($jobId, $hostId, $level, $time, $event, $msg)`
    ).run({ jobId, hostId, level, time: getDatetime(time), event, msg });
  },
  get: async (jobId?: number) => {
    const db = await getDb();

    db.query(logCreateTableSql).run();

    return db
      .query(`SELECT * FROM log ${jobId ? `WHERE jobId = $jobId` : ''} ORDER BY time DESC LIMIT 50`)
      .as(Log)
      .all(jobId ? { jobId } : undefined);
  },
  getByHostId: async (hostId: number) => {
    const db = await getDb();

    db.query(logCreateTableSql).run();

    return db
      .query(`SELECT * FROM log WHERE hostId = $hostId ORDER BY time DESC LIMIT 50`)
      .as(Log)
      .all({ hostId });
  },
  removeOldLogs: async () => {
    const db = await getDb();

    db.query(logCreateTableSql).run();

    const now = new Date();
    now.setMonth(now.getMonth() - 3);
    const time = getDatetime(now.getTime());

    db.query(`DELETE FROM log WHERE time < $time`).run({ time });
  },
};

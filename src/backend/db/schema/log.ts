export class Log {
  id?: number;
  jobId?: number;
  repo: string;
  level: number;
  time: number;
  event: string;
  msg: string;
}

export const logCreateTableSql = `
  CREATE TABLE IF NOT EXISTS log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobId INTEGER,
    repo TEXT NOT NULL,
    level INTEGER NOT NULL,
    time INTEGER NOT NULL,
    event TEXT NOT NULL,
    msg TEXT NOT NULL
  )
`;

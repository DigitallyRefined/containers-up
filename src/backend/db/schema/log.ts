export class Log {
  id?: number;
  jobId?: number;
  repo: string;
  level: number;
  time: string;
  event: string;
  msg: string;
}

export const logCreateTableSql = `
  CREATE TABLE IF NOT EXISTS log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobId INTEGER,
    repo TEXT NOT NULL,
    level INTEGER NOT NULL,
    time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event TEXT NOT NULL,
    msg TEXT NOT NULL
  )
`;

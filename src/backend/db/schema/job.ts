import { Log } from '@/backend/db/schema/log';

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

export const jobCreateTableSql = `
  CREATE TABLE IF NOT EXISTS job (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repoId INTEGER NOT NULL,
    repoPr TEXT NOT NULL UNIQUE,
    folder TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

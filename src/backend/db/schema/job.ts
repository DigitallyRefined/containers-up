import { Log } from '@/backend/db/schema/log';

export enum JobStatus {
  running = 1,
  failed = 2,
  open = 3,
  completed = 4,
}

export class Job {
  id?: number;
  repoId: number;
  repoPr: string;
  folder: string;
  title: string;
  status: JobStatus;
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
    status INTEGER NOT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

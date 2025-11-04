import type { Log } from '@/backend/db/schema/log';

export enum JobStatus {
  running = 1,
  queued = 2,
  failed = 3,
  open = 4,
  completed = 5,
  closed = 6,
}

export class Job {
  id?: number;
  hostId: number;
  repoPr?: string;
  folder: string;
  title: string;
  status: JobStatus;
  created?: number;
  updated?: number;
}

export class JobWithLogs extends Job {
  logs: Log[];
}

export class JobEnriched extends JobWithLogs {
  composeFile: string;
}

export const jobCreateTableSql = `
  CREATE TABLE IF NOT EXISTS job (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    hostId INTEGER NOT NULL,
    repoPr TEXT,
    folder TEXT NOT NULL,
    title TEXT NOT NULL UNIQUE,
    status INTEGER NOT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { pathExists } from '../utils';

let db: Database | undefined;

export const getDb = async () => {
  if (db) return db;

  const dbDir = '/storage/database';
  const filename = `${dbDir}/containers-up.sqlite`;

  if (!(await pathExists(dbDir))) {
    await mkdir(dbDir, { recursive: true });
  }

  db = new Database(filename, { create: true, strict: true });

  return db;
};

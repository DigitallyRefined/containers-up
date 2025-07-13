import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { pathExists } from '@/backend/utils';

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

export const upsert = async ({
  table,
  data,
  conflictKey,
}: {
  table: string;
  data: Record<string, any>;
  conflictKey: string;
}) => {
  const columns = Object.keys(data);
  const placeholders = columns.map((col) => `$${col}`);
  const updates = columns
    .filter((col) => col !== conflictKey)
    .map((col) => `${col}=excluded.${col}`)
    .join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}`;

  return (await getDb()).query(sql).run(data);
};
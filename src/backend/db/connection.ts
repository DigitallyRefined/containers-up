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
  const db = await getDb();
  const insertData = { ...data };

  // Check if the table has an 'id' column
  const pragma = db.query(`PRAGMA table_info(${table})`).all();
  const hasId = pragma.some((col: any) => col.name === 'id');
  if (hasId && (insertData.id === undefined || insertData.id === null)) {
    // Only set id for insert, not for update on conflict
    // Get the current max id
    const row = db.query(`SELECT MAX(id) as maxId FROM ${table}`).get() as {
      maxId: number | null;
    };
    const nextId = (row?.maxId ?? 0) + 1;
    insertData.id = nextId;
  }

  const columns = Object.keys(insertData);
  const placeholders = columns.map((col) => `$${col}`);
  const updates = columns
    .filter((col) => col !== conflictKey && col !== 'id')
    .map((col) => `${col}=excluded.${col}`)
    .join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}`;

  return db.query(sql).run(insertData);
};

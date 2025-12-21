import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, upsert } from '@/backend/db/connection';
import { Setting, settingCreateTableSql } from '@/backend/db/schema/setting';
import { mainLogger } from '@/backend/utils/logger';

const migrations = [
  {
    version: 1,
    file: '0.0.7.sql',
  },
  {
    version: 2,
    file: '0.0.15.sql',
  },
  {
    version: 3,
    file: '1.3.0.sql',
  },
];

export const checkIfDatabaseNeedsUpdating = async () => {
  const db = await getDb();

  db.query(settingCreateTableSql).run();

  const setting = db
    .query(`SELECT * FROM setting WHERE key=$key`)
    .as(Setting)
    .get({ key: 'db_version' });

  const dbVersion = parseFloat(setting?.value.replaceAll('.', '').replace(/^0+/, '') || '0');

  const { version, file } = migrations[migrations.length - 1];

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  if (!dbVersion) {
    return upsert({
      table: 'setting',
      data: { key: 'db_version', value: version },
      conflictKey: 'key',
    });
  }

  if (dbVersion !== version) {
    mainLogger.info(
      `Database version (${dbVersion}) is different from app version (${version}), running migrations...`
    );
    const migrationPath = join(__dirname, file);
    const migrationSql = await readFile(migrationPath, 'utf-8');
    db.run(migrationSql);
    mainLogger.info(`Migrated to version ${version}`);

    mainLogger.info('Database migrations completed successfully');

    return upsert({
      table: 'setting',
      data: { key: 'db_version', value: version },
      conflictKey: 'key',
    });
  }

  mainLogger.info(`Database is up to date ${version}`);
};

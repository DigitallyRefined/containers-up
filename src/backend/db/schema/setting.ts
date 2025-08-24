export class Setting {
  id?: number;
  key: string;
  value: string;
}

export const settingCreateTableSql = `
  CREATE TABLE IF NOT EXISTS setting (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL
  )
`;

export class ImageHash {
  image: string;
  tags: string | string[];
}

export const imageHashCreateTableSql = `
  CREATE TABLE IF NOT EXISTS image_hash (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    image TEXT NOT NULL UNIQUE,
    tags TEXT NOT NULL,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

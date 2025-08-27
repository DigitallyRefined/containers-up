import { getDb } from '@/backend/db/connection';
import { ImageHash, imageHashCreateTableSql } from '@/backend/db/schema/image-hash';

export const imageHash = {
  create: async ({ image, tags }: ImageHash) => {
    const db = await getDb();

    db.query(imageHashCreateTableSql).run();

    db.query(`INSERT INTO image_hash (image, tags) VALUES ($image, $tags)`).run({
      image,
      tags: JSON.stringify(tags),
    });
  },
  get: async (image: string) => {
    const db = await getDb();

    db.query(imageHashCreateTableSql).run();

    const result = db
      .query(`SELECT * FROM image_hash WHERE image = $image`)
      .as(ImageHash)
      .get({ image });

    if (result) {
      result.tags = JSON.parse(result.tags as string);
    }

    return result;
  },
};

import { z } from 'zod';

export class Host {
  id?: number;
  name: string;
  sshHost: string;
  sshKey: string;
  repo?: string;
  webhookSecret?: string;
  workingFolder?: string;
  excludeFolders?: string;
  created?: string;
}

export const hostCreateTableSql = `
  CREATE TABLE IF NOT EXISTS host (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sshHost TEXT NOT NULL,
    repo TEXT,
    webhookSecret TEXT,
    workingFolder TEXT,
    excludeFolders TEXT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export const hostSchema = z.object({
  id: z.number().optional(),
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens are allowed'),
  sshHost: z
    .string()
    .min(1, 'SSH Host is required')
    .refine((val) => val.includes('@'), {
      message: 'SSH Host must include an @ (e.g. user@example.com)',
    }),
  sshKey: z
    .string()
    .min(1, 'SSH Key is required')
    .refine(
      (val) =>
        /^-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+-----END [A-Z ]+ PRIVATE KEY-----\s*$/m.test(
          val.trim()
        ),
      {
        message: 'Invalid SSH private key format',
      }
    ),
  repo: z.string().optional(),
  webhookSecret: z.string().optional(),
  workingFolder: z.string().optional(),
  excludeFolders: z.string().optional(),
});

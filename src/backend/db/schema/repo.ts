import { z } from 'zod';

export class Repo {
  id?: number;
  name: string;
  sshCmd: string;
  sshKey: string;
  repo: string;
  webhookSecret: string;
  workingFolder: string;
  excludeFolders?: string;
  created?: string;
}

export const repoCreateTableSql = `
  CREATE TABLE IF NOT EXISTS repo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sshCmd TEXT NOT NULL,
    repo TEXT NOT NULL UNIQUE,
    webhookSecret TEXT NOT NULL,
    workingFolder TEXT NOT NULL,
    excludeFolders TEXT,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export const repoSchema = z.object({
  id: z.number().optional(),
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens are allowed'),
  sshCmd: z
    .string()
    .min(1, 'SSH Command is required')
    .refine((val) => val.includes('@'), {
      message: 'SSH Command must include an @ (e.g. user@example.com)',
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
  repo: z.string().min(1, 'Repository URL is required'),
  webhookSecret: z.string().min(1, 'Webhook Secret is required'),
  workingFolder: z.string().min(1, 'Working Folder is required'),
  excludeFolders: z.string().optional(),
});

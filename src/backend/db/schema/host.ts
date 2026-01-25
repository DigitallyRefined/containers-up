import { z } from 'zod';

export class Host {
  id?: number;
  name: string;
  sshHost: string;
  sshKey: string;
  repoHost?: string;
  repo?: string;
  botType?: 'dependabot' | 'renovate';
  webhookSecret?: string;
  workingFolder?: string;
  excludeFolders?: string;
  cron?: string;
  squashUpdates?: boolean;
  sortOrder?: number;
  created?: string;
}

export const hostCreateTableSql = `
  CREATE TABLE IF NOT EXISTS host (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sshHost TEXT NOT NULL,
    repoHost TEXT DEFAULT 'https://github.com',
    repo TEXT,
    botType TEXT DEFAULT 'dependabot',
    webhookSecret TEXT,
    workingFolder TEXT,
    excludeFolders TEXT,
    cron TEXT,
    squashUpdates INTEGER DEFAULT 0,
    sortOrder INTEGER,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repoHost, repo)
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
  repoHost: z.string().default('https://github.com'),
  repo: z.string().optional(),
  botType: z.enum(['dependabot', 'renovate']).default('dependabot'),
  webhookSecret: z.string().optional(),
  workingFolder: z.string().optional(),
  excludeFolders: z.string().optional(),
  cron: z.string().optional(),
  squashUpdates: z.boolean().optional().default(false),
  sortOrder: z.number().optional(),
});

export const hostEditSchema = hostSchema.extend({
  sshKey: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') return true; // Allow empty for editing
        return /^-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+-----END [A-Z ]+ PRIVATE KEY-----\s*$/m.test(
          val.trim()
        );
      },
      {
        message: 'Invalid SSH private key format',
      }
    ),
});

import { Repo, repo as repoDb } from '@/backend/db/repo';
import { pathExists } from '../utils';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export const getRepos = async () => {
  return await repoDb.getAll();
};

export const postRepo = async (repo: Repo & { sshKey: string }) => {
  const sshPath = `${os.homedir()}/.ssh`;
  const sshConfigPath = `${sshPath}/config`;
  if (!(await pathExists(sshConfigPath))) {
    await fs.mkdir(path.dirname(sshConfigPath), { recursive: true });
    await fs.writeFile(
      sshConfigPath,
      `Host *
    StrictHostKeyChecking no
    ControlMaster auto
    ControlPath ~/.ssh/control-%C
    ControlPersist 10m`,
      { mode: 0o600 }
    );
  }

  const sshKeyBuffer = Buffer.from(repo.sshKey, 'base64');
  await fs.writeFile(`${sshPath}/id_ed25519`, sshKeyBuffer, { mode: 0o600 });

  await repoDb.create(repo);

  return 'ok';
};

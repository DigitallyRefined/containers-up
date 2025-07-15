import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { Repo, repo as repoDb } from '@/backend/db/repo';
import { pathExists } from '@/backend/utils';
import { createExec } from '@/backend/utils/exec';
import { mainLogger } from '@/backend/utils/logger';

const event = 'repo';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

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
    ControlPath ~/.ssh/control-${repo.name}
    ControlPersist 20m`,
      { mode: 0o600 }
    );
  }

  const sshKeyBuffer = Buffer.from(repo.sshKey, 'base64');
  await fs.writeFile(`${sshPath}/id_ed25519`, sshKeyBuffer, { mode: 0o600 });

  const { stdout: dockerContext } = await exec.run('docker context ls --format "{{.Name}}"');
  const contextExists = dockerContext.split('\n').includes(repo.name);
  if (!contextExists) {
    await exec.run(`docker context create ${repo.name} --docker "host=ssh://${repo.sshCmd}"`);
  }

  await repoDb.create(repo);

  return 'ok';
};

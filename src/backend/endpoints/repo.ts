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
  await fs.mkdir(path.dirname(sshConfigPath), { recursive: true });

  const repoSshConfig = (await getRepos())
    .map(
      (r) => `Host ${r.name}
    HostName ${r.sshCmd.split('@')[1]}
    User ${r.sshCmd.split('@')[0]}
    IdentityFile ~/.ssh/id_ed25519-${r.name}
    ControlPath ~/.ssh/control-${r.name}`
    )
    .join('\n\n');

  await fs.writeFile(
    sshConfigPath,
    `Host *
    StrictHostKeyChecking no
    ControlMaster auto
    ControlPersist 20m
    ForwardAgent yes
    
${repoSshConfig}`,
    { mode: 0o600 }
  );

  const sshKeyBuffer = Buffer.from(repo.sshKey, 'base64');
  await fs.writeFile(`${sshPath}/id_ed25519-${repo.name}`, sshKeyBuffer, { mode: 0o600 });

  const { stdout: dockerContext } = await exec.run('docker context ls --format "{{.Name}}"');
  const contextExists = dockerContext.split('\n').includes(repo.name);
  if (!contextExists) {
    await exec.run(`docker context create ${repo.name} --docker "host=ssh://${repo.name}"`);
  }

  await repoDb.create(repo);

  return 'ok';
};

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { repo as repoDb } from '@/backend/db/repo';
import { Repo } from '@/backend/db/schema/repo';
import { createExec } from '@/backend/utils/exec';
import { mainLogger } from '@/backend/utils/logger';

const event = 'repo';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

const sshPath = `${os.homedir()}/.ssh`;
const sshConfigPath = `${sshPath}/config`;

export const getRepos = async () => {
  return await repoDb.getAll();
};

export const postRepo = async (repo: Repo) => {
  await repoDb.upsert(repo);

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

  await fs.writeFile(`${sshPath}/id_ed25519-${repo.name}`, repo.sshKey, { mode: 0o600 });

  const { stdout: dockerContext } = await exec.run('docker context ls --format "{{.Name}}"');
  const contextExists = dockerContext.split('\n').includes(repo.name);
  if (!contextExists) {
    await exec.run(`docker context create ${repo.name} --docker "host=ssh://${repo.name}"`);
  }

  return { message: 'ok' };
};

const deleteFiles = async (repo: Repo) => {
  try {
    await fs.unlink(`${sshPath}/id_ed25519-${repo.name}`);

    const { stdout: dockerContext } = await exec.run('docker context ls --format "{{.Name}}"');
    const contextExists = dockerContext.split('\n').includes(repo.name);
    if (contextExists) {
      await exec.run(`docker context rm ${repo.name}`);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to delete files for repo');
  }
};

export const putRepo = async (repo: Repo) => {
  const existingRepo = await repoDb.get(repo.id);
  if (!existingRepo) {
    throw new Error('Repo not found');
  }

  await deleteFiles(existingRepo);

  return await postRepo({ ...existingRepo, ...repo });
};

export const deleteRepo = async (repo: Repo) => {
  const existingRepo = await repoDb.getByName(repo.name);
  if (!existingRepo) {
    throw new Error('Repo not found');
  }

  await deleteFiles(existingRepo);

  return await repoDb.delete(existingRepo.id);
};
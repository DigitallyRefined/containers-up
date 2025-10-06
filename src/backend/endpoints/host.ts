import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { host as hostDb } from '@/backend/db/host';
import { Host, hostSchema } from '@/backend/db/schema/host';
import { createExec } from '@/backend/utils/exec';
import { mainLogger } from '@/backend/utils/logger';
import { getDockerCmd } from '@/backend/utils/docker';

const event = 'host';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

const sshPath = `${os.homedir()}/.ssh`;
const sshConfigPath = `${sshPath}/config`;

export const getHosts = async () => {
  return await hostDb.getAll();
};

export const postHost = async (host: Host, options: { createSshKey?: boolean } = {}) => {
  const nameValidation = hostSchema.pick({ name: true }).safeParse({ name: host.name });
  if (!nameValidation.success) {
    throw new Error('Invalid host name', { cause: nameValidation.error.issues });
  }

  const existingHost = await hostDb.getByName(host.name);
  if (existingHost && existingHost.id !== host.id) {
    throw new Error('Host already exists', { cause: 'HOST_ALREADY_EXISTS' });
  }

  if (host.workingFolder.endsWith('/')) {
    host.workingFolder = host.workingFolder.slice(0, -1);
  }

  await fs.mkdir(path.dirname(sshConfigPath), { recursive: true });

  await createFiles(host, options);

  try {
    await exec.run(`${getDockerCmd(host.name)} ps`);
  } catch (error) {
    if (host.id) {
      await createFiles({ ...(await hostDb.get(host.id)), sshKey: host.sshKey }, options);
    } else {
      await deleteFiles(host);
    }

    throw new Error(
      `Failed to connect to host. Please check your SSH key is correct and Docker is running${
        error.stderr ? `: ${error.stderr}` : ''
      }`,
      {
        cause: error,
      }
    );
  }

  await hostDb.upsert(host);

  await setCrontab();

  return { message: 'ok' };
};

const createFiles = async (host: Host, options: { createSshKey?: boolean } = {}) => {
  const { createSshKey = true } = options;

  const hostSshConfig = (await getHosts())
    .filter((r) => r.id !== host.id)
    .concat(host ?? [])
    .map(
      (r) => `Host ${r.name}
    HostName ${r.sshHost.split('@')[1]}
    User ${r.sshHost.split('@')[0]}
    IdentityFile ~/.ssh/id_ed25519-${r.name}
    ControlPath ~/.ssh/control-${r.name}`
    )
    .join('\n\n');

  await fs.unlink(sshConfigPath).catch(() => null);
  await fs.writeFile(
    sshConfigPath,
    `Host *
    StrictHostKeyChecking no
    ControlMaster auto
    ControlPersist ${process.env.SSH_CONTROL_PERSIST || '20m'}
    ForwardAgent yes
    
${hostSshConfig}`,
    { mode: 0o600 }
  );

  // Only create SSH key file if requested and we have a valid key
  if (createSshKey && host.sshKey && host.sshKey.trim() !== '') {
    await fs.writeFile(`${sshPath}/id_ed25519-${host.name}`, host.sshKey, { mode: 0o600 });
  }

  const { stdout: dockerContext } = await exec.run('docker context ls --format "{{.Name}}"');
  const contextExists = dockerContext.split('\n').includes(host.name);
  if (!contextExists) {
    await exec.run(`docker context create ${host.name} --docker "host=ssh://${host.name}"`);
  }
};

const deleteFiles = async (host: Host, options: { deleteSshKey?: boolean } = {}) => {
  const { deleteSshKey = true } = options;

  try {
    // Only delete SSH key file if requested
    if (deleteSshKey) {
      const idKeyPath = `${sshPath}/id_ed25519-${host.name}`;
      if (await fs.exists(idKeyPath)) {
        await fs.unlink(idKeyPath);
      }
    }

    const controlPath = `${sshPath}/control-${host.name}`;
    if (await fs.exists(controlPath)) {
      await fs.unlink(controlPath);
    }

    const { stdout: dockerContext } = await exec.run('docker context ls --format "{{.Name}}"');
    const contextExists = dockerContext.split('\n').includes(host.name);
    if (contextExists) {
      await exec.run(`docker context rm ${host.name}`);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to delete files for host');
  }
};

export const setCrontab = async () => {
  const hosts = await getHosts();

  let crontab = '';
  for (const host of hosts) {
    if (!host.cron) continue;
    crontab += `${host.cron} bun /home/bun/app/index.js --check-for-updates ${host.name}\n`;
  }

  await fs.writeFile('/tmp/crontab', crontab);
  await exec.run(`crontab /tmp/crontab`);
};

export const putHost = async (host: Host) => {
  const existingHost = await hostDb.get(host.id);
  if (!existingHost) {
    throw new Error('Host not found');
  }

  const hasNewSshKey = host.sshKey && host.sshKey.trim() !== '';

  await deleteFiles(existingHost, { deleteSshKey: hasNewSshKey });

  return await postHost({ ...existingHost, ...host }, { createSshKey: hasNewSshKey });
};

export const deleteHost = async (host: Host) => {
  const existingHost = await hostDb.getByName(host.name);
  if (!existingHost) {
    throw new Error('Host not found');
  }

  await deleteFiles(existingHost);

  return await hostDb.delete(existingHost.id);
};

import { mainLogger } from '@/backend/utils/logger';
import { createExec } from '@/backend/utils/exec';

const event = 'compose';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

export const findComposeFiles = async (hostName: string, host: string, workingFolder?: string) => {
  if (!workingFolder) {
    throw new Error('Working folder is not set', { cause: 'NO_WORKING_FOLDER' });
  }

  const sshHost = `find ${workingFolder}/ -regextype posix-extended -regex ".*/(docker-)?compose\.ya?ml$" 2>/dev/null`;
  const { stdout } = await exec.sshRun(hostName, host, sshHost, false);
  return stdout
    .split('\n')
    .filter((line: string) => /(^|\/)(docker-)?compose\.ya?ml$/.test(line))
    .map((line: string) => line.replace(`${workingFolder}/`, ''))
    .sort();
};

import { mainLogger } from '@/backend/utils/logger';
import { createExec } from '@/backend/utils/exec';

const event = 'compose';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

export const findComposeFiles = async (repoName: string, host: string, workingFolder: string) => {
  const sshCmd = `find ${workingFolder}/ -regextype posix-extended -regex ".*/(docker-)?compose\.ya?ml$" 2>/dev/null`;
  const { stdout } = await exec.sshRun(repoName, host, sshCmd, false);
  return stdout
    .split('\n')
    .filter((line: string) => /(^|\/)(docker-)?compose\.ya?ml$/.test(line))
    .map((line: string) => line.replace(`${workingFolder}/`, ''))
    .sort();
};

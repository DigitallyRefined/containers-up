import { promisify } from 'util';
import { exec } from 'child_process';
import type { Logger } from 'pino';

const execAsync = promisify(exec);

const parseDockerStdout = (stdout: string) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export const getDockerCmd = (context: string) => `docker --context ${context}`;

export const createExec = (logger: Logger) => {
  const run = async (command: string) => {
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        // stderr is used as info if the command doesn't exit with code > 0
        logger.info(stderr);
      }
      return { stdout: stdout.trim(), stderr, code: 0 };
    } catch (error: any) {
      // error.code is the exit code, error.stdout and error.stderr may be present
      const errorData = {
        stdout: error.stdout ? error.stdout.trim() : '',
        stderr: error.stderr || error.message || '',
        code: typeof error.code === 'number' ? error.code : 1,
      };
      logger.error(`${command} ${errorData.stderr} ${errorData.stdout} ${errorData.code}`);
      throw errorData;
    }
  };

  return {
    run,
    sshRun: async (repoName: string, host: string, command: string) =>
      run(`if ! pgrep -u "$(whoami)" ssh-agent > /dev/null; then
        ssh-agent -s
      fi
      export SSH_AUTH_SOCK=$(find /tmp -type s -name 'agent.*' 2>/dev/null | head -n1)
      if [ -n "$SSH_AUTH_SOCK" ]; then
        export SSH_AGENT_PID=$(echo "$SSH_AUTH_SOCK" | grep -oE 'agent\.[0-9]+' | grep -oE '[0-9]+')
      fi
      ssh-add ~/.ssh/id_ed25519-${repoName} > /dev/null 2>&1
      ssh ${host} '${command}'`),
    listContainers: async (context: string) => {
      const { stdout } = await run(
        `${getDockerCmd(context)} inspect --format "{{json .}}" $(${getDockerCmd(context)} ps -aq)`
      );

      return parseDockerStdout(stdout);
    },
    listImages: async (context: string) => {
      const { stdout } = await run(
        `${getDockerCmd(context)} images --no-trunc --format "{{json .}}"`
      );
      return parseDockerStdout(stdout);
    },
  };
};

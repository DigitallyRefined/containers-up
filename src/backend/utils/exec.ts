import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import type { Logger } from 'pino';

const execAsync = promisify(exec);

export const createExec = (logger: Logger) => {
  const run = async (command: string, throwOnError = true) => {
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
      if (throwOnError) {
        logger.error(`${command} ${errorData.stderr} ${errorData.stdout} ${errorData.code}`);
        throw errorData;
      }
      return errorData;
    }
  };

  type StreamOptions = {
    onStdout?: (data: Buffer) => void;
    onStderr?: (data: Buffer) => void;
    onClose?: (code: number | null) => void;
    onError?: (err: Error) => void;
  };

  const stream = (command: string, { onStdout, onStderr, onClose, onError }: StreamOptions) => {
    // Split command into command and args for spawn
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);
    const child = spawn(cmd, args, { shell: true });
    if (onStdout) child.stdout.on('data', onStdout);
    if (onStderr) child.stderr.on('data', onStderr);
    if (onClose) child.on('close', onClose);
    if (onError) child.on('error', onError);
    return child;
  };

  const getSshCommand = (
    repoName: string,
    host: string,
    command: string
  ) => `if ! pgrep -u "$(whoami)" ssh-agent > /dev/null; then
        ssh-agent -s
      fi
      export SSH_AUTH_SOCK=$(find /tmp -type s -name 'agent.*' 2>/dev/null | head -n1)
      if [ -n "$SSH_AUTH_SOCK" ]; then
        export SSH_AGENT_PID=$(echo "$SSH_AUTH_SOCK" | grep -oE 'agent\.[0-9]+' | grep -oE '[0-9]+')
      fi
      ssh-add ~/.ssh/id_ed25519-${repoName} > /dev/null 2>&1
      ssh ${host} '${command}'`;

  const sshRun = async (repoName: string, host: string, command: string, throwOnError = true) =>
    run(getSshCommand(repoName, host, command), throwOnError);

  return {
    run,
    stream,
    sshRun,
    sshStream: (repoName: string, host: string, command: string, options: StreamOptions) =>
      stream(getSshCommand(repoName, host, command), options),
    pathExistsOnRemote: async (repoName: string, host: string, path: string) => {
      try {
        await sshRun(repoName, host, `test -e "${path.replace(/"/g, '')}"`);
        return true;
      } catch (error) {
        return false;
      }
    },
  };
};

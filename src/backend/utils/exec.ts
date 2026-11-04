import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

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
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: unknown };
      // error.code is the exit code, error.stdout and error.stderr may be present
      const errorData = {
        stdout: err.stdout ? err.stdout.trim() : '',
        stderr: err.stderr || err.message || '',
        code: typeof err.code === 'number' ? err.code : 1,
      };
      if (throwOnError) {
        logger.error(
          `${command} ${errorData?.stderr ?? ''} ${errorData?.stdout ?? ''} ${errorData?.code ?? ''}`
        );
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
    hostName: string,
    host: string,
    command: string
  ) => `for socket in $(find ~/.ssh-agent.sock -type s 2>/dev/null); do
        SSH_AUTH_SOCK=$socket ssh-add -l > /dev/null 2>&1
        case $? in
          0|1) export SSH_AUTH_SOCK=$socket; break ;;
        esac
      done
      if [ -z "$SSH_AUTH_SOCK" ]; then
        eval "$(ssh-agent -s -a ~/.ssh-agent.sock)" > /dev/null
      fi
      if ! ssh-add ~/.ssh/id_ed25519-${hostName} > /dev/null 2>&1; then
        echo "Failed to load SSH key for ${hostName}" >&2
        exit 1
      fi
      ssh ${host} '${command}'`;

  const sshRun = async (hostName: string, host: string, command: string, throwOnError = true) =>
    run(getSshCommand(hostName, host, command), throwOnError);

  return {
    run,
    stream,
    sshRun,
    sshStream: (hostName: string, host: string, command: string, options: StreamOptions) =>
      stream(getSshCommand(hostName, host, command), options),
    pathExistsOnRemote: async (hostName: string, host: string, path: string) => {
      try {
        await sshRun(hostName, host, `test -e "${path.replace(/"/g, '')}"`);
        return true;
      } catch {
        return false;
      }
    },
  };
};

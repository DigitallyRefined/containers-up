import type { Logger } from 'pino';
import type { Host } from '@/backend/db/schema/host';
import { createExec } from '@/backend/utils/exec';

export const getDockerCmd = (context: string) => `docker --context "${context}"`;

export const createDockerExec = (logger: Logger) => {
  const exec = createExec(logger);

  const parseDockerStdout = (stdout: string) => {
    try {
      return stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (err) {
      logger.error({ stdout, err }, 'Failed to parse docker stdout');
      throw err;
    }
  };

  const runParsedDockerCommand = async (command: string) => {
    const { stdout } = await exec.run(command);
    return parseDockerStdout(stdout);
  };

  // Regex that removes ANSI color/control codes (even if ESC is missing)
  const stripAnsi = (input: string) => input.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

  const runStreamedCommand = (command: string, options?: { hostName: string; host: string }) => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let closed = false;

    const stream = new ReadableStream({
      start(controller) {
        const safeEnqueue = (data: string | Uint8Array) => {
          if (closed) return;
          try {
            // Always work with a string to strip color codes
            const str = typeof data === 'string' ? data : decoder.decode(data);
            const clean = stripAnsi(str);

            // Encode back into Uint8Array for streaming
            const chunk = encoder.encode(clean);
            controller.enqueue(chunk);
          } catch (err) {
            logger.warn(`Failed to enqueue data: ${err.message}`);
            closed = true;
          }
        };

        const safeClose = () => {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch (err) {
              logger.warn(`Failed to close controller: ${err.message}`);
            }
          }
        };

        const handlers = {
          onStdout: (data: string | Uint8Array) => safeEnqueue(data),
          onStderr: (data: string | Uint8Array) => safeEnqueue(data),
          onClose: () => safeClose(),
          onError: (err: Error) => {
            safeEnqueue(`Error: ${err.message}\n`);
            safeClose();
          },
        };

        if (options) {
          exec.sshStream(options.hostName, options.host, command, handlers);
        } else {
          exec.stream(command, handlers);
        }
      },

      cancel() {
        closed = true; // prevent further enqueues
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  };

  return {
    listContainers: async (context: string) =>
      runParsedDockerCommand(
        `${getDockerCmd(context)} inspect --format "{{json .}}" $(${getDockerCmd(
          context
        )} ps -aq --no-trunc)`
      ),
    listImages: async (context: string) =>
      runParsedDockerCommand(
        `${getDockerCmd(context)} images --no-trunc --digests --format "{{json .}}"`
      ),
    restartStopOrDeleteContainer: (
      context: string,
      containerId: string,
      action: 'restart' | 'stop' | 'start' | 'rm'
    ) => runStreamedCommand(`${getDockerCmd(context)} ${action} "${containerId}"`),
    streamContainerLogs: (context: string, containerId: string) =>
      runStreamedCommand(
        `${getDockerCmd(context)} logs -n ${process.env.LOG_LINES || 500} -f "${containerId}"`
      ),
    removeImage: (context: string, imageId: string) =>
      runStreamedCommand(`${getDockerCmd(context)} rmi "${imageId}"`),
    isInvalidComposeFolder: async (host: Host, composeFolder: string) =>
      typeof composeFolder !== 'string' ||
      !(await exec.pathExistsOnRemote(host.name, host.sshHost, composeFolder)),
    stopCompose: (hostName: string, host: string, composeFolder: string) => {
      return runStreamedCommand(`docker compose --project-directory "${composeFolder}" down`, {
        hostName,
        host,
      });
    },
    startCompose: (hostName: string, host: string, composeFolder: string) =>
      runStreamedCommand(`docker compose --project-directory "${composeFolder}" up -d`, {
        hostName,
        host,
      }),
    restartCompose: (hostName: string, host: string, composeFolder: string, pullFirst = false) => {
      let command = '';
      if (pullFirst) {
        command = `docker compose --project-directory "${composeFolder}" pull && `;
      }
      command += `docker compose --project-directory "${composeFolder}" down && docker compose --project-directory "${composeFolder}" up -d`;
      if (composeFolder.includes('containers-up')) {
        command = `nohup bash -c "${command}" >> /tmp/containers-up.log 2>&1 &`;
      }
      return runStreamedCommand(command, {
        hostName,
        host,
      });
    },
    getLocalImageDigest: async (context: string, image: string) => {
      const { stdout, code } = await exec.run(
        `${getDockerCmd(context)} image inspect --format="{{index .RepoDigests 0}}" "${image}"`,
        false
      );

      if (code !== 0) {
        logger.error({ code, stdout }, `Failed to get local image digest for "${image}"`);
        return '';
      }

      const digest = stdout.trim();

      logger.debug({ digest }, `Local image digest for "${image}"`);

      // Extract manifest digest from local repository digest
      // Local digest format: registry.com/repo@sha256:abc123...
      // Remote digest format: sha256:abc123...
      return digest.includes('@') ? digest.split('@')[1] : digest;
    },
    getLocalImageConfigDigest: async (context: string, image: string) => {
      // Prefer .Id which equals the digest of the image's config JSON (image ID)
      let result = await exec.run(
        `${getDockerCmd(context)} image inspect --format='{{.Id}}' "${image}"`,
        false
      );

      if (result.code !== 0 || !result.stdout.trim()) {
        // Fallback to .Config.Image if available on this docker version
        result = await exec.run(
          `${getDockerCmd(context)} image inspect --format='{{.Config.Image}}' "${image}"`,
          false
        );
      }

      if (result.code !== 0 || !result.stdout.trim()) {
        logger.error(
          { code: result.code, stdout: result.stdout },
          `Failed to get local image config digest for "${image}"`
        );
        return '';
      }

      const configDigest = result.stdout.trim();
      logger.debug({ configDigest }, `Local image config digest for "${image}"`);
      return configDigest;
    },
    getRemoteImageDigest: async (selectedHost: Host, image: string) => {
      const { stdout, code } = await exec.sshRun(
        selectedHost.name,
        selectedHost.sshHost,
        `docker buildx imagetools inspect --format "{{json .Manifest.Digest}}" "${image}"`
      );

      if (code !== 0) {
        logger.error(
          { code, stdout },
          `Failed to get remote image digest for "${image}" on "${selectedHost.name}"`
        );
        return '';
      }

      const digest = parseDockerStdout(stdout)[0];

      logger.debug({ digest }, `Remote image digest for "${image}"`);

      return digest;
    },
  };
};

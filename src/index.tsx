import { serve, type ErrorLike, type Serve } from 'bun';
import index from '@/index.html';

import { getContainers } from '@/backend/endpoints/containers';
import { githubWebhookHandler, type GitHubWebhookEvent } from '@/backend/endpoints/webhook/github';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';
import { deleteRepo, getRepos, postRepo, putRepo } from '@/backend/endpoints/repo';
import { repo } from '@/backend/db/repo';
import { repoSchema } from '@/backend/db/schema/repo';
import { log as logDb } from '@/backend/db/log';
import { restartJob } from '@/backend/endpoints/jobs';
import { job as jobDb } from '@/backend/db/job';
import { Repo } from '@/backend/db/schema/repo';
import { isValidContainerIdOrName } from '@/backend/utils';
import { createDockerExec } from '@/backend/utils/docker';
import { mainLogger } from './backend/utils/logger';
import { findComposeFiles } from '@/backend/endpoints/compose';

const dockerExec = createDockerExec(mainLogger);

const API_PROXY_KEY = process.env.API_PROXY_KEY;

const requireAuthKey = (req: Request) => {
  const key = req.headers.get(`x-proxy-key`);
  if (!API_PROXY_KEY || key !== API_PROXY_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
};

const getAuthorizedRepo = async (
  req: Request,
  repoParam: string
): Promise<{ error?: Response; selectedRepo?: Repo }> => {
  const auth = requireAuthKey(req);
  if (auth) return { error: auth };

  const selectedRepo = await repo.getByName(repoParam);
  if (!selectedRepo) {
    return { error: new Response('Repository not found', { status: 404 }) };
  }
  return { selectedRepo };
};

const serverOptions: Partial<Serve> = {
  idleTimeout: 30,

  error(error: ErrorLike) {
    console.error('Unhandled error in route handler:', error);
    return Response.json(
      {
        error: error.message || 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && {
          stack: error.stack,
          details: error.toString(),
        }),
        ...(error.cause && { cause: error.cause }),
      },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  },

  development: process.env.NODE_ENV !== 'production' && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
};

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    '/*': index,

    '/icons/:name': async (req) => {
      const iconName = req.params.name;

      // Validate filename to prevent directory traversal
      if (
        !iconName ||
        iconName.includes('..') ||
        iconName.includes('/') ||
        iconName.includes('\\')
      ) {
        return new Response('File not found', { status: 404 });
      }

      // Only allow specific file extensions
      const allowedExtensions = ['.webp'];
      const hasValidExtension = allowedExtensions.some((ext) =>
        iconName.toLowerCase().endsWith(ext)
      );
      if (!hasValidExtension) {
        return new Response('File not found', { status: 404 });
      }

      // Use absolute path and restrict to icons directory
      const filePath = `/storage/icons/${iconName}`;

      try {
        const file = Bun.file(filePath);
        const exists = await file.exists();
        if (!exists) {
          return new Response('File not found', { status: 404 });
        }
        return new Response(file);
      } catch (error) {
        return new Response('Error serving file', { status: 500 });
      }
    },

    '/api/repo': {
      async GET(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(
          (await getRepos()).map((repo) => ({ ...repo, webhookSecret: undefined }))
        );
      },
    },

    '/api/repo/:name': {
      async POST(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(await postRepo({ name: req.params.name, ...(await req.json()) }));
      },

      async PUT(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(await putRepo({ name: req.params.name, ...(await req.json()) }));
      },

      async DELETE(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(await deleteRepo({ name: req.params.name } as Repo));
      },
    },

    '/api/repo/:name/logs': {
      async GET(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.name);
        if (error) return error;

        return Response.json(await logDb.getByRepo(selectedRepo.repo));
      },
    },

    '/api/repo/:name/jobs': {
      async GET(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.name);
        if (error) return error;

        return Response.json(await jobDb.getJobsWithLogs(selectedRepo.id));
      },
    },

    '/api/repo/:repo/containers': {
      async GET(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        return Response.json(await getContainers(selectedRepo));
      },

      async DELETE(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        const cleanupLogs = await containersCleanup(selectedRepo.name);

        let logs: string | any[] = 'Cleanup complete, nothing was removed';
        if (cleanupLogs.length) {
          cleanupLogs.forEach((log) => logDb.create({ repo: selectedRepo.repo, ...log }));
          logs = cleanupLogs;
        }

        return Response.json(logs);
      },
    },

    '/api/repo/:repo/container/:containerId': {
      async PUT(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        const containerId = req.params.containerId;
        if (!isValidContainerIdOrName(containerId)) {
          return new Response('Invalid container ID or name', { status: 400 });
        }

        return dockerExec.restartOrStopContainer(selectedRepo.name, containerId, 'restart');
      },

      async DELETE(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        const containerId = req.params.containerId;
        if (!isValidContainerIdOrName(containerId)) {
          return new Response('Invalid container ID or name', { status: 400 });
        }

        return dockerExec.restartOrStopContainer(selectedRepo.name, containerId, 'stop');
      },
    },

    '/api/repo/:repo/image/:imageId': {
      async DELETE(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        const imageId = req.params.imageId;
        if (!isValidContainerIdOrName(imageId)) {
          return new Response('Invalid image ID or name', { status: 400 });
        }

        return dockerExec.removeImage(selectedRepo.name, imageId);
      },
    },

    '/api/repo/:repo/compose': {
      async GET(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        return Response.json(
          await findComposeFiles(selectedRepo.name, selectedRepo.sshCmd, selectedRepo.workingFolder)
        );
      },

      async POST(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        const data = await req.json();

        const composeFile = `${selectedRepo.workingFolder}/${data.composeFile}`;
        if (await dockerExec.isInvalidComposeFile(selectedRepo, composeFile)) {
          return Response.json({ error: 'Invalid or missing compose file' }, { status: 400 });
        }

        return dockerExec.startCompose(selectedRepo.name, selectedRepo.sshCmd, composeFile);
      },

      async PUT(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        const data = await req.json();

        const composeFile = `${selectedRepo.workingFolder}/${data.composeFile}`;
        if (await dockerExec.isInvalidComposeFile(selectedRepo, composeFile)) {
          return Response.json({ error: 'Invalid or missing compose file' }, { status: 400 });
        }

        return dockerExec.restartCompose(selectedRepo.name, selectedRepo.sshCmd, composeFile);
      },

      async DELETE(req) {
        const { error, selectedRepo } = await getAuthorizedRepo(req, req.params.repo);
        if (error) return error;

        const data = await req.json();

        const composeFile = `${selectedRepo.workingFolder}/${data.composeFile}`;
        if (await dockerExec.isInvalidComposeFile(selectedRepo, composeFile)) {
          return Response.json({ error: 'Invalid or missing compose file' }, { status: 400 });
        }

        return dockerExec.stopCompose(selectedRepo.name, selectedRepo.sshCmd, composeFile);
      },
    },

    '/api/job/:id': {
      async POST(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        restartJob(req.params.id);

        return Response.json({ message: 'job restarted' });
      },
    },
  },

  ...serverOptions,
});

console.log(`🚀 Server running at ${server.url}`);

const webhookServer = serve({
  port: 3001,
  routes: {
    '/api/webhook/github/repo/:name': {
      async POST(req) {
        const selectedRepo = await repo.getByName(req.params.name);
        if (!selectedRepo) {
          return new Response('Not Found', { status: 404 });
        }

        const signature = req.headers.get('x-hub-signature-256');
        if (!signature) {
          return new Response('Unauthorized (no signature)', { status: 401 });
        }

        const bodyBuffer = new Uint8Array(await req.arrayBuffer());
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(selectedRepo.webhookSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, bodyBuffer);
        const hash = Array.from(new Uint8Array(signatureBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const expectedSignature = `sha256=${hash}`;

        if (signature !== expectedSignature) {
          return new Response('Unauthorized (bad signature)', { status: 401 });
        }

        const webhookData = JSON.parse(new TextDecoder().decode(bodyBuffer));
        const webhookEvent: GitHubWebhookEvent = {
          sender: webhookData.sender?.login,
          repo: webhookData.repository.full_name,
          number: webhookData.pull_request?.number,
          action: webhookData.action,
          merged: webhookData.pull_request?.merged,
          title: webhookData.pull_request?.title,
        };

        const selectedRepos = await repo.getAllByRepo(webhookEvent.repo);
        if (!selectedRepos) {
          return new Response('Repository not found', { status: 404 });
        }

        for (const selectedRepo of selectedRepos) {
          githubWebhookHandler(webhookEvent, selectedRepo);
        }

        return Response.json({ message: 'webhook received' });
      },
    },
  },

  ...serverOptions,
});

console.log(`⤷ webhook server running at ${webhookServer.url}`);

import { serve } from 'bun';
import index from '@/index.html';

import { getContainers } from '@/backend/endpoints/containers';
import { githubWebhookHandler, type GitHubWebhookEvent } from '@/backend/endpoints/webhook/github';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';
import { getRepos, postRepo } from '@/backend/endpoints/repo';
import { repo } from '@/backend/db/repo';
import { log as logDb } from '@/backend/db/log';
import { restartJob } from '@/backend/endpoints/jobs';
import { job as jobDb } from '@/backend/db/job';

const API_PROXY_KEY = process.env.API_PROXY_KEY;

const requireAuthKey = (req: Request) => {
  const key = req.headers.get(`x-proxy-key`);
  if (!API_PROXY_KEY || key !== API_PROXY_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
};

const devServerOptions = {
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

        if (!/^[a-z0-9-]+$/.test(req.params.name)) {
          return Response.json({
            error: 'Name must contain only lowercase letters, numbers, or hyphens',
          });
        }

        return Response.json(await postRepo({ name: req.params.name, ...(await req.json()) }));
      },
    },

    '/api/repo/:name/jobs': {
      async GET(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        const selectedRepo = await repo.getByName(req.params.name);
        if (!selectedRepo) {
          return new Response('Repository not found', { status: 404 });
        }

        return Response.json(await jobDb.getJobsWithLogs(selectedRepo.id));
      },
    },

    '/api/repo/:repo/containers': {
      async GET(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        const selectedRepo = await repo.getByName(req.params.repo);
        if (!selectedRepo) {
          return new Response('Repository not found', { status: 404 });
        }

        return Response.json(await getContainers(selectedRepo));
      },

      async DELETE(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        const selectedRepo = await repo.getByName(req.params.repo);
        if (!selectedRepo) {
          return new Response('Repository not found', { status: 404 });
        }

        const cleanupLogs = await containersCleanup(selectedRepo.name);

        if (cleanupLogs.length) {
          cleanupLogs.forEach((log) => logDb.create({ repo: selectedRepo.repo, ...log }));
        }

        return Response.json(cleanupLogs);
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

  ...devServerOptions,
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

  ...devServerOptions,
});

console.log(`⤷ webhook server running at ${webhookServer.url}`);

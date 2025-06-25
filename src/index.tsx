import { serve } from "bun";
import index from "./index.html";

import { getContainers } from './backend/endpoints/containers';
import { githubWebhookHandler } from './backend/webhook/github';

const PROXY_KEY = process.env.PROXY_KEY;
const API_KEY = process.env.API_KEY;

const requireApiKey = (req: Request, headerKey: string, expectedKey?: string) => {
  const key = req.headers.get(`x-${headerKey}-key`);
  if (!expectedKey || key !== expectedKey) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
};

const devServerOptions = {  
  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  }
};

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/containers": {
      async GET(req) {
        const auth = requireApiKey(req, 'proxy', PROXY_KEY);
        if (auth) return auth;
        return Response.json(await getContainers());
      },
    },
  },

  ...devServerOptions,
});

console.log(`🚀 Server running at ${server.url}`);

const webhookServer = serve({
  port: 3001,
  routes: {
    "/api/webhook/github": {
      async POST(req) {
        const auth = requireApiKey(req, 'api', API_KEY);
        if (auth) return auth;
        return Response.json(await githubWebhookHandler());
      },
    },
  },

  ...devServerOptions,
});

console.log(`⤷ webhook server running at ${webhookServer.url}`);

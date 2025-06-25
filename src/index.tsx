import { serve } from "bun";
import index from "./index.html";

import { getContainers } from './backend/endpoints/containers';
import { githubWebhookHandler } from './backend/webhook/github';

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
        return Response.json(await githubWebhookHandler());
      },
    },
  },

  ...devServerOptions,
});

console.log(`⤷ webhook server running at ${webhookServer.url}`);

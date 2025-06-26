import { containerApi } from '../endpoints/container/socket';

export const githubWebhookHandler = async () => {
const containers = await containerApi.listContainers();

  return {
    message: "webhook Hello, world!",
    method: "GET",
    containers
  };
};
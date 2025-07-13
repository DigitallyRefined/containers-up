import { promises as fs } from 'fs';

import { pathExists } from '@/backend/utils';

// Get icons from https://dashboardicons.com
const imgServiceUrl = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/webp';
const dir = '/storage/icons';

export const getIcon = async (name: string | undefined): Promise<void> => {
  if (!name) {
    return;
  }
  const filePath = `${dir}/${name}.webp`;
  if (await pathExists(filePath)) {
    return;
  }

  await fs.mkdir(dir, { recursive: true });

  let response = await fetch(`${imgServiceUrl}/${encodeURIComponent(name)}.webp`);
  if (!response.ok) {
    response = await fetch(`${imgServiceUrl}/docker.webp`);
    if (!response.ok) {
      return;
    }
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(filePath, buffer);
};

import { promises as fs } from 'fs';

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

export const getDatetime = (unixTime?: number | string) => {
  const date = unixTime ? new Date(Number(unixTime)) : new Date();
  return date.toISOString().replace('T', ' ').substring(0, 19);
};

export const waitASecond = async () => new Promise((resolve) => setTimeout(resolve, 1000));

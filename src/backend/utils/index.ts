import { promises as fs } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

export const execAsync = promisify(exec);

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

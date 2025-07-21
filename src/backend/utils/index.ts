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

export const getTraefikUrl = (ruleLabel: string) => {
  let firstUrl = '';
  const hostMatch = ruleLabel.match(/Host\(`([^`]*)`\)/);
  const host = hostMatch ? hostMatch[1] : '';
  const pathPrefixes = [];
  const pathPrefixRegex = /PathPrefix\(`([^`]*)`\)/g;
  let match: RegExpExecArray | null;
  while ((match = pathPrefixRegex.exec(ruleLabel)) !== null) {
    pathPrefixes.push(match[1]);
  }
  const pathRegex = /Path\(`([^`]*)`\)/g;
  while ((match = pathRegex.exec(ruleLabel)) !== null) {
    pathPrefixes.push(match[1]);
  }
  if (host) {
    // If there are path prefixes, combine host with the first one
    if (pathPrefixes.length > 0) {
      firstUrl = host + pathPrefixes[0];
    } else {
      firstUrl = host;
    }
  } else {
    // Fallback to previous logic if no host is found
    firstUrl = ruleLabel
      .replace(/Query\(`[^`]*`,\s*`[^`]*`\)/g, '')
      .replace(/Host\(`([^`]*)`\)/g, '$1')
      .replace(/PathPrefix\(`([^`]*)`\)/g, '$1')
      .replace(/Path\(`([^`]*)`\)/g, '$1')
      .replace(/&&/g, '')
      .replace(/ /g, '')
      .split('||')[0];
  }
  return firstUrl;
};

export const isValidContainerIdOrName = (id: string) =>
  typeof id === 'string' && /^[a-zA-Z0-9_.-]+$/.test(id);
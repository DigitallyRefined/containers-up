interface RegistryOptions {
  registry: string;
  repository: string;
  tag: string;
  username?: string;
  token?: string;
}

/**
 * Parses a docker image string into its components.
 * Handles formats like:
 * - nginx -> library/nginx:latest (index.docker.io)
 * - nginx:alpine -> library/nginx:alpine (index.docker.io)
 * - myregistry.com/myimage:tag
 * - myuser/myimage
 */
const parseImageString = (imageStr: string) => {
  let registry = 'index.docker.io';
  let repository = '';
  let tag = 'latest';

  // Check for tag
  const lastColonIndex = imageStr.lastIndexOf(':');
  const slashIndex = imageStr.lastIndexOf('/');

  // If colon is after the last slash, it's a tag (avoids port numbers in registry)
  if (lastColonIndex > slashIndex && lastColonIndex !== -1) {
    tag = imageStr.substring(lastColonIndex + 1);
    imageStr = imageStr.substring(0, lastColonIndex);
  }

  // Check for registry
  const parts = imageStr.split('/');
  if (
    parts.length > 1 &&
    (parts[0].includes('.') || parts[0].includes(':') || parts[0] === 'localhost')
  ) {
    registry = parts[0];
    parts.shift();
  }

  repository = parts.join('/');

  // Normalize Docker Hub registry for API calls
  if (registry === 'docker.io') {
    registry = 'index.docker.io';
  }

  // Handle official library images on Docker Hub
  if (registry === 'index.docker.io' && !repository.includes('/')) {
    repository = `library/${repository}`;
  }

  return { registry, repository, tag };
};

/**
 * Build auth-capable registry options from an image reference and environment.
 */
const createRegistryOptionsFromRef = (imageRef: string): RegistryOptions => {
  const { registry, repository, tag } = parseImageString(imageRef);

  let username: string | undefined;
  let token: string | undefined;

  if (registry.includes('docker.io')) {
    username = process.env.DOCKER_USERNAME;
    token = process.env.DOCKER_TOKEN;
  } else if (registry.includes('ghcr.io')) {
    username = process.env.GHCR_USERNAME;
    token = process.env.GHCR_TOKEN;
  }

  if (!token) {
    username = process.env.CONTAINER_REGISTRY_USERNAME;
    token = process.env.CONTAINER_REGISTRY_TOKEN;
  }

  return {
    registry,
    repository,
    tag,
    username,
    token,
  };
};

/**
 * Fetches the auth token for a given scope and realm.
 */
const getAuthToken = async (
  realm: string,
  service: string,
  scope: string,
  { username, token }: Partial<RegistryOptions>
) => {
  try {
    const encodedAuth =
      username && token ? Buffer.from(`${username}:${token}`).toString('base64') : null;
    const headers = encodedAuth ? { Authorization: `Basic ${encodedAuth}` } : {};

    const url = `${realm}?service=${service}&scope=${scope}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status ?? ''}`);
    }
    const data = await response.json();
    return data.token || data.access_token;
  } catch (error) {
    throw new Error(`Failed to get auth token: ${error.message ?? ''}`);
  }
};

/**
 * Fetches the manifest digest for a given image.
 */
const getRemoteImageDigest = async ({
  registry,
  repository,
  tag,
  username,
  token,
}: RegistryOptions) => {
  // Determine base URL
  const protocol = registry.startsWith('http') ? '' : 'https://';
  const baseUrl = `${protocol}${registry}`;

  // Docker Hub specific handling for URL
  const registryApiUrl = registry.includes('docker.io') ? 'https://registry-1.docker.io' : baseUrl;

  const manifestUrl = `${registryApiUrl}/v2/${repository}/manifests/${tag}`;

  const encodedAuth =
    username && token ? Buffer.from(`${username}:${token}`).toString('base64') : null;

  const headers = {
    ...(encodedAuth ? { Authorization: `Basic ${encodedAuth}` } : {}),
    Accept:
      'application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json',
  };

  // First attempt (might fail with 401)
  let response = await fetch(manifestUrl, { method: 'HEAD', headers });

  if (response.status === 401) {
    // Handle Authentication
    const authHeader = response.headers.get('www-authenticate');
    if (authHeader) {
      const realmMatch = authHeader.match(/realm="([^"]+)"/);
      const serviceMatch = authHeader.match(/service="([^"]+)"/);
      const scopeMatch = authHeader.match(/scope="([^"]+)"/);

      if (realmMatch && serviceMatch && scopeMatch) {
        const bearerToken = await getAuthToken(realmMatch[1], serviceMatch[1], scopeMatch[1], {
          username,
          token,
        });
        headers.Authorization = `Bearer ${bearerToken}`;
        // Retry with token
        response = await fetch(manifestUrl, { method: 'HEAD', headers });
      }
    }
  }

  if (response.status === 404) {
    throw new Error(`Image not found: ${repository}:${tag}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch manifest: ${response.status ?? ''} ${response.statusText ?? ''}`
    );
  }

  const digest = response.headers.get('docker-content-digest');
  if (!digest) {
    throw new Error('No Docker-Content-Digest header found in response');
  }
  return digest;
};

export const getRemoteImageDigestFromRef = async (imageRef: string): Promise<string | null> => {
  const options = createRegistryOptionsFromRef(imageRef);
  return getRemoteImageDigest(options);
};

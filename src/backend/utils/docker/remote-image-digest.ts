type Registry = 'dockerhub' | 'generic';

interface RegistryOptions {
  registry: Registry;
  registryHost: string; // e.g. 'docker.io', 'ghcr.io', 'registry.example.com'
  repository: string;
  tag: string;
  username?: string;
  token?: string;
}

/**
 * Parse Docker image reference string into registry host, repository, image, tag, and full repo string.
 */
function parseImageReference(ref: string): {
  registryHost: string;
  repository: string;
  tag: string;
} {
  let tag = 'latest';
  let name = ref;

  const tagIndex = ref.lastIndexOf(':');
  const slashIndex = ref.indexOf('/');

  // Only treat colon as tag separator if it comes after last slash
  if (tagIndex > -1 && tagIndex > slashIndex) {
    tag = ref.substring(tagIndex + 1);
    name = ref.substring(0, tagIndex);
  }

  // Default registry host
  let registryHost = 'docker.io';
  let path = name;

  const firstPart = name.split('/')[0];
  if (firstPart.includes('.') || firstPart.includes(':') || firstPart === 'localhost') {
    registryHost = firstPart;
    path = name.substring(firstPart.length + 1);
  }

  const parts = path.split('/');
  let repository = '';
  let image = '';

  if (registryHost === 'docker.io') {
    // Official Docker images default to "library"
    if (parts.length === 1) {
      repository = 'library';
      image = parts[0];
    } else {
      repository = parts[0];
      image = parts.slice(1).join('/');
    }
  } else {
    if (parts.length === 1) {
      repository = '';
      image = parts[0];
    } else {
      repository = parts[0];
      image = parts.slice(1).join('/');
    }
  }

  const fullRepo = repository ? `${repository}/${image}` : image;

  return { registryHost, repository: fullRepo, tag };
}

/**
 * Get authentication header string for the registry.
 */
async function getAuthHeader(options: RegistryOptions): Promise<string | null> {
  const { registry, registryHost, repository, username, token } = options;

  const encodedAuth =
    username && token ? Buffer.from(`${username}:${token}`).toString('base64') : null;

  // Docker Hub token endpoint
  const headers = encodedAuth
    ? {
        Authorization: `Basic ${encodedAuth}`,
      }
    : {};

  let baseUrl = `https://${registryHost}/token?service=${registryHost}`;
  if (registry === 'dockerhub') {
    baseUrl = 'https://auth.docker.io/token?service=registry.docker.io';
  }
  const url = `${baseUrl}&scope=repository:${repository}:pull`;
  const res = await fetch(url, {
    headers: { ...headers, Accept: 'application/json' },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Auth token fetch failed: ${url} ${res.status} ${res.statusText} ${JSON.stringify(data)}`
    );
  }

  return `Bearer ${data.token}`;
}

/**
 * Fetch the image manifest digest with a HEAD request.
 */
async function getImageDigest(options: RegistryOptions): Promise<string | null> {
  const { registry, registryHost, repository, tag } = options;

  const authHeader = await getAuthHeader(options);

  // Docker Hub registry base URL
  let baseURL =
    registry === 'dockerhub' ? 'https://registry-1.docker.io' : `https://${registryHost}`;

  const url = `${baseURL.replace(/\/$/, '')}/v2/${repository}/manifests/${tag}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.docker.distribution.manifest.v2+json',
  };

  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch manifest HEAD: ${res.status} ${res.statusText}`);
    }

    const digest = res.headers.get('docker-content-digest');
    if (!digest) {
      throw new Error('docker-content-digest header not found');
    }

    return digest;
  } catch (err) {
    throw new Error('Error fetching manifest digest', { cause: err });
  }
}

/**
 * Main function: parse image ref, determine registry, pick token from env,
 * and fetch digest.
 */
export async function getImageDigestFromRef(imageRef: string): Promise<string | null> {
  const { registryHost, repository, tag } = parseImageReference(imageRef);

  const registry: Registry =
    registryHost === 'docker.io' || registryHost === 'registry-1.docker.io'
      ? 'dockerhub'
      : 'generic';

  // Automatically get token from environment variables
  let username: string | undefined;
  let token: string | undefined;

  if (registry === 'dockerhub') {
    username = process.env.DOCKER_USERNAME;
    token = process.env.DOCKER_TOKEN;
  } else if (registryHost === 'ghcr.io') {
    username = process.env.GHCR_USERNAME;
    token = process.env.GHCR_TOKEN;
  }

  if (!token) {
    username = process.env.CONTAINER_REGISTRY_USERNAME;
    token = process.env.CONTAINER_REGISTRY_TOKEN;
  }

  const options: RegistryOptions = {
    registry,
    registryHost,
    repository,
    tag,
    username,
    token,
  };

  return getImageDigest(options);
}

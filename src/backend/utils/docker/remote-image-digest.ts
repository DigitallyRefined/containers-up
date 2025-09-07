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
const parseImageReference = (
  ref: string
): {
  registryHost: string;
  repository: string;
  tag: string;
} => {
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
};

/**
 * Build auth-capable registry options from an image reference and environment.
 */
const createRegistryOptionsFromRef = (imageRef: string): RegistryOptions => {
  const { registryHost, repository, tag } = parseImageReference(imageRef);

  const registry: Registry =
    registryHost === 'docker.io' || registryHost === 'registry-1.docker.io'
      ? 'dockerhub'
      : 'generic';

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

  return {
    registry,
    registryHost,
    repository,
    tag,
    username,
    token,
  };
};

/**
 * Compute the registry base URL for API requests.
 */
const getRegistryBaseURL = (options: Pick<RegistryOptions, 'registry' | 'registryHost'>) =>
  options.registry === 'dockerhub'
    ? 'https://registry-1.docker.io'
    : `https://${options.registryHost}`;

/**
 * Get authentication header string for the registry.
 */
const getAuthHeader = async (options: RegistryOptions): Promise<string | null> => {
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
};

/**
 * Fetch the image manifest digest with a HEAD request.
 */
const getImageDigest = async (options: RegistryOptions): Promise<string | null> => {
  const { registry, registryHost, repository, tag } = options;

  const authHeader = await getAuthHeader(options);

  // Docker Hub registry base URL
  let baseURL = getRegistryBaseURL({ registry, registryHost });

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
};

/**
 * Fetch the config digest (image ID basis) for a specific platform.
 * Falls back to single-manifest images by returning their config.digest directly.
 */
export const getRemoteConfigDigest = async (
  options: RegistryOptions,
  platformOs: string = 'linux',
  platformArch: string = 'amd64'
): Promise<string | null> => {
  const { registry, registryHost, repository, tag } = options;

  const authHeader = await getAuthHeader(options);

  let baseURL = getRegistryBaseURL({ registry, registryHost });
  const url = `${baseURL.replace(/\/$/, '')}/v2/${repository}/manifests/${tag}`;

  const headers: Record<string, string> = {
    // Support Docker and OCI media types
    Accept: [
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
      'application/vnd.oci.image.manifest.v1+json',
    ].join(', '),
  };

  if (authHeader) headers['Authorization'] = authHeader;

  try {
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText} ${text}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const manifestJson = await res.json();

    const isIndex =
      contentType.includes('application/vnd.docker.distribution.manifest.list.v2+json') ||
      contentType.includes('application/vnd.oci.image.index.v1+json') ||
      Array.isArray((manifestJson as any).manifests);

    // If it's a manifest list / index, select the matching platform digest
    if (isIndex) {
      const manifests = (manifestJson as any).manifests as Array<any>;
      const match = manifests?.find(
        (m) => m.platform?.os === platformOs && m.platform?.architecture === platformArch
      );
      const manifestDigest = match?.digest as string | undefined;
      if (!manifestDigest) {
        throw new Error(
          `No manifest found for platform ${platformOs}/${platformArch} in ${repository}:${tag}`
        );
      }

      // Fetch the specific platform manifest and extract its config.digest
      const manifestUrl = `${baseURL.replace(
        /\/$/,
        ''
      )}/v2/${repository}/manifests/${manifestDigest}`;
      const manifestHeaders: Record<string, string> = {
        Accept:
          'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
      };
      if (authHeader) manifestHeaders['Authorization'] = authHeader;

      const manifestRes = await fetch(manifestUrl, { method: 'GET', headers: manifestHeaders });
      if (!manifestRes.ok) {
        const text = await manifestRes.text();
        throw new Error(`Failed to fetch platform manifest: ${manifestRes.status} ${text}`);
      }
      const manifestBody = await manifestRes.json();
      const configDigest = (manifestBody as any)?.config?.digest as string | undefined;
      if (!configDigest) throw new Error('config.digest not found on platform manifest');
      return configDigest;
    }

    // Single-arch manifest: return its config.digest directly
    const configDigest = (manifestJson as any)?.config?.digest as string | undefined;
    if (!configDigest) throw new Error('config.digest not found on image manifest');
    return configDigest;
  } catch (err) {
    throw new Error('Error fetching remote config digest', { cause: err as any });
  }
};

/**
 * Main function: parse image ref, determine registry, pick token from env,
 * and fetch digest.
 */
export const getImageDigestFromRef = async (imageRef: string): Promise<string | null> => {
  const options = createRegistryOptionsFromRef(imageRef);
  return getImageDigest(options);
};

export const getRemoteConfigDigestFromRef = async (
  imageRef: string,
  platformOs: string = 'linux',
  platformArch: string = 'amd64'
): Promise<string | null> => {
  const options = createRegistryOptionsFromRef(imageRef);
  return getRemoteConfigDigest(options, platformOs, platformArch);
};

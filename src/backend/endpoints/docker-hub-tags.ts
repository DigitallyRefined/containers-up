import { imageHash } from '@/backend/db/image-hash';

const DOCKER_USERNAME = process.env.DOCKER_USERNAME;
const DOCKER_TOKEN = process.env.DOCKER_TOKEN;

const PER_PAGE = 100;
const MAX_PAGES = 3;

interface DockerHubLoginResponse {
  token: string;
}

interface DockerTag {
  name?: string;
  digest?: string;
}

interface DockerTagsResponse {
  results: DockerTag[];
  next: string | null;
}

const getDockerHubToken = async (): Promise<string> => {
  if (!DOCKER_USERNAME || !DOCKER_TOKEN) {
    return;
  }

  const response = await fetch('https://hub.docker.com/v2/users/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DOCKER_USERNAME, password: DOCKER_TOKEN }),
  });

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const data = (await response.json()) as DockerHubLoginResponse;
  return data.token;
};

const getTagsPage = async (
  token: string | undefined,
  namespace: string,
  repository: string,
  page: number
): Promise<DockerTagsResponse> => {
  const url = `https://hub.docker.com/v2/repositories/${namespace}/${repository}/tags/?page=${page}&page_size=${PER_PAGE}`;
  const response = await fetch(
    url,
    token
      ? {
          headers: {
            Authorization: `JWT ${token}`,
          },
        }
      : undefined
  );
  if (!response.ok) {
    throw new Error(`Fetching tags failed with status ${response.status}`);
  }
  return (await response.json()) as DockerTagsResponse;
};

const findTagsByDigest = async (namespace: string, repository: string, targetSha: string) => {
  try {
    const webToken = await getDockerHubToken();
    let page = 1;
    let foundTags: string[] = [];

    while (page <= MAX_PAGES) {
      const tagsResponse = await getTagsPage(webToken, namespace, repository, page);

      for (const tag of tagsResponse.results) {
        if (tag.digest?.startsWith(targetSha)) {
          foundTags.push(tag.name);
        }
      }

      if (foundTags.length > 0 || !tagsResponse.next) {
        break;
      }
      page++;
    }

    if (foundTags.length === 0) {
      return `No tags found matching digest ${targetSha}`;
    } else {
      return foundTags;
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
};

const isFromDockerHub = (image: string): boolean => {
  // Check for sha256 hash in the image and remove it if present
  const imageWithoutHash = image.includes('@sha256:') ? image.split('@sha256:')[0] : image;

  let firstPart = imageWithoutHash.split('/')[0];

  // Check for explicit docker.io domain
  if (firstPart === 'docker.io') {
    return true;
  }

  if (firstPart.includes(':')) {
    firstPart = firstPart.split(':')[0];
  }

  // If the first part has '.', it's a domain → not Docker Hub
  const hasDomain = firstPart.includes('.');

  // If no domain prefix, it's from Docker Hub
  return !hasDomain;
};

export const findTagsMatchingImageDigest = async (image: string) => {
  let namespace: string;
  let repository: string;
  let targetSha: string;

  if (!isFromDockerHub(image)) {
    throw new Error('Only images from Docker Hub are currently supported');
  }

  if (image.includes('/')) {
    let repositorySha: string;
    [namespace, repositorySha] = image.split('/');
    [repository, targetSha] = repositorySha.split('@');
  } else {
    namespace = 'library';
    [repository, targetSha] = image.split('@');
  }

  if (repository.includes(':')) {
    repository = repository.split(':')[0];
  }

  if (!namespace || !repository || !targetSha || !targetSha.startsWith('sha256:')) {
    throw new Error('Invalid image format. Expected format: namespace/repository@sha256:...');
  }

  let foundTags: string | string[] = (await imageHash.get(image))?.tags;
  if (!foundTags) {
    foundTags = await findTagsByDigest(namespace, repository, targetSha);

    if (Array.isArray(foundTags)) {
      await imageHash.create({
        image,
        tags: foundTags,
      });
    }
  }

  return foundTags;
};

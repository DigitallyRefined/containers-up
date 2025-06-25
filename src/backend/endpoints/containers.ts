import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const getDockerImages = async () => {
  const { stdout: dockerImagesStr } = await execAsync(
    'docker images --no-trunc --format json | jq -s .'
  );
  return JSON.parse(dockerImagesStr);
};

const getUnusedDockerImages = async () => {
  const { stdout: unusedDockerImagesStr } = await execAsync(
    `docker images --format "{{.Repository}}:{{.Tag}} {{.ID}}" | grep -v -Ff <(docker ps --format "{{.Image}}")`
  );
  return unusedDockerImagesStr
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [image, id] = line.split(' ') || [];
      return { Image: image, ID: id };
    });
};

const getDockerPs = async () => {
  const { stdout: dockerPsStr } = await execAsync(
    'docker ps -a --no-trunc --format json | jq -s .'
  );
  const containers = JSON.parse(dockerPsStr);
  return containers.map((container: any) => ({
    ...container,
    Labels:
      typeof container.Labels === 'string'
        ? container.Labels.split(',')
            .map((label: string) => label.trim())
            .filter(Boolean)
            .reduce((acc: Record<string, string>, label: string) => {
              const [key, value] = label.split('=');
              if (key && value !== undefined) {
                acc[key] = value;
              }
              return acc;
            }, {})
        : {},
  }));
};

const getComposeFiles = async () => {
  const { stdout: composeFilesStr } = await execAsync(
    "find /data -type f \\( -name '*compose.yml' -o -name '*compose.yaml' \\)"
  );
  return composeFilesStr
    .split('\n')
    .filter(Boolean)
    .map((path) => path.replace(/^\/data\//, ''));
};

const getContainersRunningViaCompose = async () => {
  const dockerPsResult = await getDockerPs();
  const composedContainers = dockerPsResult.filter(
    (container: any) =>
      container.Labels &&
      Object.prototype.hasOwnProperty.call(
        container.Labels,
        'com.docker.compose.project.config_files'
      )
  );

  const composedIds = new Set(composedContainers.map((c: any) => c.ID));
  const dockerPsResultFiltered = dockerPsResult.filter(
    (container: any) => !composedIds.has(container.ID)
  );

  return { composedContainers, dockerPs: dockerPsResultFiltered };
};

export const getContainers = async () => {
  const [dockerImages, unusedDockerImages, { composedContainers, dockerPs }, composeFiles] =
    await Promise.all([
      getDockerImages(),
      getUnusedDockerImages(),
      getContainersRunningViaCompose(),
      getComposeFiles(),
    ]);

  const composedContainersSortedByImage: any = [];
  dockerImages.forEach(({ Repository }: any) => {
    composedContainers
      .filter((container: any) => container.Image.includes(Repository))
      .forEach((container: any) => {
        composedContainersSortedByImage.push(container);
      });
  });

  const composedContainersByComposeFileMap = new Map<string, any[]>();
  composedContainersSortedByImage.forEach((container: any) => {
    const configFilesLabel = container.Labels['com.docker.compose.project.config_files'];
    let composeFile = '[unmanaged]';
    if (configFilesLabel) {
      composeFile =
        composeFiles.find((file: string) => configFilesLabel.endsWith(file)) || composeFile;
    }
    container.composeFile = composeFile;

    const ruleLabelKey = Object.keys(container.Labels).find(
      (key) => key.startsWith('traefik.http.routers.') && key.endsWith('.rule')
    );
    const ruleLabel = ruleLabelKey ? container.Labels[ruleLabelKey] : undefined;
    if (ruleLabel) {
      const host = ruleLabel
        .replaceAll('Host(`', '')
        .replaceAll('`)', '')
        .replaceAll('&&', '')
        .replaceAll('Path(`', '')
        .replaceAll(' ', '');
      const tlsLabelKey = Object.keys(container.Labels).find(
        (key) => key.startsWith('traefik.http.routers.') && key.endsWith('.tls')
      );
      const isTls = tlsLabelKey ? container.Labels[tlsLabelKey] === 'true' : undefined;
      container.url = `http${isTls ? 's' : ''}://${host}`;
    }

    if (!composedContainersByComposeFileMap.has(composeFile)) {
      composedContainersByComposeFileMap.set(composeFile, []);
    }
    composedContainersByComposeFileMap.get(composeFile)!.push(container);
  });

  const composedContainersByComposeFile = Object.fromEntries(composedContainersByComposeFileMap);
  const composedContainersByComposeFileKeys = Array.from(composedContainersByComposeFileMap.keys());

  return {
    composedContainers: composedContainersByComposeFile,
    separateContainers: dockerPs,
    separateComposeFiles: composeFiles.filter(
      (composeFile) => !composedContainersByComposeFileKeys.includes(composeFile)
    ),
    dockerImages,
    unusedDockerImages,
  };
};

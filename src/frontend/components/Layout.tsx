import { Info, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import type { Host } from '@/backend/db/schema/host';
import type { JobEnriched } from '@/backend/db/schema/job';

import { ComposedContainer as ComposedContainerComponent } from '@/frontend/components/Compose/ComposedContainer';
import { PreviousRunningComposeFiles } from '@/frontend/components/Compose/PreviousRunningComposeFiles';
import { Container } from '@/frontend/components/Container/Container';
import { useContainerRefresh } from '@/frontend/components/Container/ContainerRefreshContext';
import { ContainerImage } from '@/frontend/components/Container/Image';
import { Jobs } from '@/frontend/components/Container/Jobs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/frontend/components/ui/Accordion';
import { Button } from '@/frontend/components/ui/Button';
import { Card, CardContent } from '@/frontend/components/ui/Card';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import { useContainers } from '@/frontend/hooks/useApi';
import { useLocalStorage } from '@/frontend/hooks/useLocalStorage';
import { getFolderName } from '@/frontend/lib/utils';

export interface Service {
  Id: string;
  Name: string;
  State: {
    Status: string;
    StartedAt?: string;
    Health?: {
      Status: string;
    };
  };
  Config: {
    Image: string;
    Labels: {
      'com.docker.compose.project': string;
      'com.docker.compose.service': string;
    };
  };
  urls?: string[];
}

interface ComposedContainer {
  services: Service[];
  jobs: JobEnriched[];
}

export interface Image {
  ID: string;
  Repository: string;
  Tag: string;
  Size: number;
  CreatedAt: string;
}

export interface ContainersResponse {
  composedContainers?: {
    [key: string]: ComposedContainer;
  };
  otherComposedContainers?: {
    [key: string]: Service[];
  };
  separateContainers?: Service[];
  images?: Image[];
  unusedDockerImages?: Image[];
  incompleteJobs?: JobEnriched[];
}

export const ContainerLayout = ({
  selectedHost,
  selectedSort,
}: {
  selectedHost?: Host;
  selectedSort: string;
}) => {
  useContainerRefresh();
  const selectedHostName = selectedHost?.name ?? '';

  // Use React Query to fetch containers data
  const {
    data: containersData = {},
    isLoading: loading,
    error,
    refetch,
  } = useContainers(selectedHostName, selectedSort);

  const incompleteJobs = containersData.incompleteJobs ?? [];
  const separateContainers = containersData.separateContainers ?? [];
  const images = containersData.images ?? [];
  const unusedDockerImages = containersData.unusedDockerImages ?? [];
  const otherComposedContainers = containersData.otherComposedContainers ?? {};
  const composedContainers = containersData.composedContainers;

  const [openAccordionItems, setOpenAccordionItems] = useLocalStorage<string[]>(
    'openAccordionItems',
    'global',
    [
      'updates',
      'previousRunningComposedFiles',
      'otherComposedContainers',
      'separateContainers',
      'unusedDockerImages',
    ],
    'replace'
  );

  const handleAccordionChange = (values: string[]) => {
    setOpenAccordionItems(values);
  };

  // Refetch when refreshKey changes (for manual refresh)
  useEffect(() => {
    if (selectedHostName) {
      refetch();
    }
  }, [selectedHostName, refetch]);

  if (error) {
    return (
      <div className="container mx-auto p-8 text-center relative flex items-center justify-center gap-2">
        <Tooltip content="Refresh">
          <Button
            variant="outline"
            size="sm"
            aria-label="Refresh"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        </Tooltip>
        <span className="text-red-500">Error: {error.message}</span>
      </div>
    );
  }

  if (loading) {
    return <div className="container mx-auto p-8 text-center relative">Loading containers...</div>;
  }

  return (
    <div className="container mx-auto p-2 sm:p-4 md:p-6 relative max-w-none">
      {incompleteJobs.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4 rounded-lg text-white font-semibold bg-blue-400 dark:bg-blue-900">
            <div className="flex items-center mb-2">
              <Info className="w-5 h-5 mr-2 flex-shrink-0" />
              <span className="font-bold">Pending Updates</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {incompleteJobs.map((job) => (
                <Jobs
                  key={job.id}
                  job={job}
                  hostName={selectedHostName}
                  composeFolder={getFolderName(job.composeFile)}
                  repoHost={selectedHost?.repoHost}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedHost && composedContainers && (Object.keys(composedContainers).length ?? 0) > 0 ? (
        <div className="grid gap-4 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3 mb-8">
          {Object.entries(composedContainers).map(([composeFile, containerData]) => (
            <ComposedContainerComponent
              key={composeFile}
              composeFolder={getFolderName(composeFile)}
              services={containerData.services}
              jobs={containerData.jobs}
              host={selectedHost}
              openAccordionItems={openAccordionItems}
              onAccordionChange={handleAccordionChange}
            />
          ))}
        </div>
      ) : (
        <div className="container mx-auto p-8 text-center relative">
          <p>No composed containers found</p>
          <p className="text-xs">
            (if this is unexpected, check your SSH host, key, and working folder are correct)
          </p>
        </div>
      )}

      <Accordion type="multiple" value={openAccordionItems} onValueChange={handleAccordionChange}>
        {selectedHost && (
          <PreviousRunningComposeFiles
            selectedHost={selectedHostName}
            composedContainers={composedContainers}
            otherComposedContainers={otherComposedContainers}
          />
        )}

        {selectedHost && Object.keys(otherComposedContainers).length > 0 && (
          <AccordionItem value="otherComposedContainers">
            <AccordionTrigger>Other Composed Containers</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-4 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3 mb-8">
                {Object.entries(otherComposedContainers).map(([filename, services]) => (
                  <ComposedContainerComponent
                    key={filename}
                    composeFolder={getFolderName(filename)}
                    services={services}
                    host={selectedHost}
                    hideViewDependabot
                    hideCheckForUpdates
                    openAccordionItems={openAccordionItems}
                    onAccordionChange={handleAccordionChange}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {separateContainers.length > 0 && (
          <AccordionItem value="separateContainers">
            <AccordionTrigger>Separate Containers</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-left">
                {separateContainers.map((service) => (
                  <Container key={service.Id} service={service} hostName={selectedHostName} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {images.length > 0 && (
          <AccordionItem value="images">
            <AccordionTrigger>Images</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-left">
                {images.map((image) => (
                  <ContainerImage key={image.ID} image={image} hostName={selectedHostName} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {unusedDockerImages.length > 0 && (
          <AccordionItem value="unusedDockerImages">
            <AccordionTrigger>Unused Docker Images</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-left">
                {unusedDockerImages.map((image) => (
                  <ContainerImage
                    key={image.ID}
                    image={image}
                    hostName={selectedHostName}
                    showDelete
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};

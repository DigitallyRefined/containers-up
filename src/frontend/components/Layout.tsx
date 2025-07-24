import { useEffect, useState } from 'react';
import { useContainerRefresh } from '@/frontend/components/Container/ContainerRefreshContext';
import { Info, Play, Trash } from 'lucide-react';

import { ComposedContainer } from '@/frontend/components/Compose/ComposedContainer';
import { JobWithLogs } from '@/backend/db/schema/job';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/frontend/components/ui/accordion';
import { Container } from '@/frontend/components/Container/Container';
import { ContainerImage } from '@/frontend/components/Container/Image';
import { Jobs } from '@/frontend/components/Container/Jobs';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { ComposeFiles } from '@/frontend/components/Compose/Files';
import { PreviousRunningComposeFiles } from '@/frontend/components/Compose/PreviousRunningComposeFiles';
import { useLocalStorage } from '@/frontend/lib/useLocalStorage';

export interface Service {
  Id: string;
  Name: string;
  State: {
    Status: string;
    StartedAt: string;
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

export interface ComposedContainer {
  services: Service[];
  jobs: JobWithLogs[];
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
  incompleteJobs?: JobWithLogs[];
}

export const ContainerLayout = ({ selectedRepo }: { selectedRepo: string }) => {
  const { refreshKey } = useContainerRefresh();
  const [containersData, setContainersData] = useState<ContainersResponse>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openAccordionItems, setOpenAccordionItems] = useLocalStorage<string[]>(
    'openAccordionItems',
    'global',
    ['previousRunningComposedFiles', 'otherComposedContainers', 'separateContainers'],
    'replace'
  );

  const handleAccordionChange = (values: string[]) => {
    setOpenAccordionItems(values);
  };

  useEffect(() => {
    const fetchContainers = async () => {
      if (!selectedRepo) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/repo/${selectedRepo}/containers`);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch containers${response.statusText ? `: ${response.statusText}` : ''}`
          );
        }

        const data: ContainersResponse = await response.json();
        setContainersData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch containers');
      } finally {
        setLoading(false);
      }
    };

    fetchContainers();
  }, [selectedRepo, refreshKey]);

  if (loading || !Object.keys(containersData).length) {
    return <div className='container mx-auto p-8 text-center relative'>Loading containers...</div>;
  }

  if (error) {
    return (
      <div className='container mx-auto p-8 text-center relative text-red-600'>Error: {error}</div>
    );
  }

  return (
    <div className='container mx-auto p-2 sm:p-4 md:p-6 relative max-w-none'>
      {containersData.incompleteJobs?.length > 0 && (
        <Card className='mb-4'>
          <CardContent className='p-4 rounded-lg text-white font-semibold bg-blue-400 dark:bg-blue-900'>
            <div className='flex items-center mb-2'>
              <Info className='w-5 h-5 mr-2 flex-shrink-0' />
              <span className='font-bold'>Pending Updates</span>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2'>
              {containersData.incompleteJobs.map((job) => (
                <Jobs key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {containersData.composedContainers &&
      (Object.keys(containersData.composedContainers).length ?? 0) > 0 ? (
        <div className='grid gap-4 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3 mb-8'>
          {Object.entries(containersData.composedContainers).map(([composeFile, containerData]) => (
            <ComposedContainer
              key={composeFile}
              cardTitle={composeFile}
              services={containerData.services}
              jobs={containerData.jobs}
              repoName={selectedRepo}
            />
          ))}
        </div>
      ) : (
        <div className='container mx-auto p-8 text-center relative'>
          <p>No composed containers found</p>
          <p className='text-xs'>
            (if this is unexpected, check your SSH host, key, and working folder are correct)
          </p>
        </div>
      )}

      <ComposeFiles repoName={selectedRepo} />

      <Accordion
        type='multiple'
        className='w-full'
        value={openAccordionItems}
        onValueChange={handleAccordionChange}
      >
        <PreviousRunningComposeFiles
          selectedRepo={selectedRepo}
          composedContainers={containersData.composedContainers}
          otherComposedContainers={containersData.otherComposedContainers}
        />

        {((containersData.otherComposedContainers &&
          Object.keys(containersData.otherComposedContainers).length) ??
          0) > 0 && (
          <AccordionItem value='otherComposedContainers'>
            <AccordionTrigger>Other Composed Containers</AccordionTrigger>
            <AccordionContent>
              <div className='container mx-auto py-1 sm:py-2 md:py-3 text-center relative max-w-none'>
                <div className='grid gap-2 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3'>
                  {Object.entries(containersData.otherComposedContainers).map(([key, services]) => (
                    <ComposedContainer
                      key={key}
                      cardTitle={key}
                      services={services}
                      repoName={selectedRepo}
                    />
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {(containersData.separateContainers?.length ?? 0) > 0 && (
          <AccordionItem value='separateContainers'>
            <AccordionTrigger>Separate Containers</AccordionTrigger>
            <AccordionContent>
              <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-left'>
                {containersData.separateContainers.map((service, idx) => (
                  <Container key={idx} service={service} repoName={selectedRepo} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {(containersData.images?.length ?? 0) > 0 && (
          <AccordionItem value='images'>
            <AccordionTrigger>Images</AccordionTrigger>
            <AccordionContent>
              <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-left'>
                {containersData.images.map((image, idx) => (
                  <ContainerImage key={idx} image={image} repoName={selectedRepo} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {(containersData.unusedDockerImages?.length ?? 0) > 0 && (
          <AccordionItem value='unusedDockerImages'>
            <AccordionTrigger>Unused Docker Images</AccordionTrigger>
            <AccordionContent>
              <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-left'>
                {containersData.unusedDockerImages.map((image, idx) => (
                  <ContainerImage key={idx} image={image} repoName={selectedRepo} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};

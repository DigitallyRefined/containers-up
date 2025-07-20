import { useEffect, useState } from 'react';

import { ComposedContainer } from '@/frontend/components/Container/ComposedContainer';
import { JobWithLogs } from '@/backend/db/schema/job';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/frontend/components/ui/accordion';
import { Container } from '@/frontend/components/Container/Container';
import { ContainerImage } from '@/frontend/components/Container/Image';

export interface Service {
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

export interface Images {
  Repository: string;
  Tag: string;
  Size: number;
  CreatedAt: string;
}

interface ContainersResponse {
  composedContainers?: {
    [key: string]: ComposedContainer;
  };
  otherComposedContainers?: {
    [key: string]: Service[];
  };
  separateContainers?: Service[];
  images?: Images[];
  unusedDockerImages?: Images[];
}

export const ContainerLayout = ({ selectedRepo }: { selectedRepo: string }) => {
  const [containersData, setContainersData] = useState<ContainersResponse>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [selectedRepo]);

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
      {containersData.composedContainers &&
      (Object.keys(containersData.composedContainers).length ?? 0) > 0 ? (
        <div className='grid gap-4 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3 mb-8'>
          {Object.entries(containersData.composedContainers).map(([composeFile, containerData]) => (
            <ComposedContainer
              key={composeFile}
              cardTitle={composeFile}
              services={containerData.services}
              jobs={containerData.jobs}
            />
          ))}
        </div>
      ) : (
        <div className='container mx-auto p-8 text-center relative text-red-600'>
          No composed containers found matching the configuration for this repository.
          <br />
          Check working folder is correct.
        </div>
      )}
      <Accordion type='multiple' className='w-full'>
        {((containersData.otherComposedContainers &&
          Object.keys(containersData.otherComposedContainers).length) ??
          0) > 0 && (
          <AccordionItem value='otherComposedContainers'>
            <AccordionTrigger>Other Composed Containers</AccordionTrigger>
            <AccordionContent>
              <div className='container mx-auto py-1 sm:py-2 md:py-3 text-center relative max-w-none'>
                <div className='grid gap-2 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3'>
                  {Object.entries(containersData.otherComposedContainers).map(([key, services]) => (
                    <ComposedContainer key={key} cardTitle={key} services={services} />
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
                  <Container key={idx} service={service} />
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
                  <ContainerImage key={idx} image={image} />
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
                  <ContainerImage key={idx} image={image} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};

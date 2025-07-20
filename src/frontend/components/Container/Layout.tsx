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
  composedContainers: {
    [key: string]: ComposedContainer;
  };
  otherComposedContainers: {
    [key: string]: Service[];
  };
  separateContainers: Service[];
  images: Images[];
  unusedDockerImages: Images[];
}

export const ContainerLayout = ({ selectedRepo }: { selectedRepo: string }) => {
  const [containersData, setContainersData] = useState<ContainersResponse | null>(null);
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
          throw new Error(`Failed to fetch containers: ${response.statusText}`);
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

  if (loading) {
    return <div className='container mx-auto p-8 text-center relative'>Loading containers...</div>;
  }

  if (error) {
    return (
      <div className='container mx-auto p-8 text-center relative text-red-600'>Error: {error}</div>
    );
  }

  if (!containersData || Object.keys(containersData.composedContainers).length === 0) {
    return (
      <div className='container mx-auto p-8 text-center relative'>
        <p>No containers found for this repository.</p>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-2 sm:p-4 md:p-8 text-center relative max-w-none'>
      <div className='grid gap-4 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3'>
        {Object.entries(containersData.composedContainers).map(([composeFile, containerData]) => (
          <ComposedContainer
            key={composeFile}
            cardTitle={composeFile}
            services={containerData.services}
            jobs={containerData.jobs}
          />
        ))}
      </div>
      <div className='mt-8 text-left'>
        <Accordion type='multiple' className='w-full'>
          <AccordionItem value='otherComposedContainers'>
            <AccordionTrigger>Other Composed Containers</AccordionTrigger>
            <AccordionContent>
              <div className='container mx-auto py-2 sm:py-4 md:py-8 text-center relative max-w-none'>
                <div className='grid gap-4 md:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3'>
                  {Object.entries(containersData.otherComposedContainers).map(([key, services]) => (
                    <ComposedContainer key={key} cardTitle={key} services={services} />
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='separateContainers'>
            <AccordionTrigger>Separate Containers</AccordionTrigger>
            <AccordionContent>
              <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {containersData.separateContainers.map((service, idx) => (
                  <Container key={idx} service={service} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='images'>
            <AccordionTrigger>Images</AccordionTrigger>
            <AccordionContent>
              <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {containersData.images.map((image, idx) => (
                  <ContainerImage key={idx} image={image} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='unusedDockerImages'>
            <AccordionTrigger>Unused Docker Images</AccordionTrigger>
            <AccordionContent>
              <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {containersData.unusedDockerImages.map((image, idx) => (
                  <ContainerImage key={idx} image={image} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

import { useEffect, useState } from 'react';

import { Container } from '@/frontend/components/Container/Container';
import { JobWithLogs } from '@/backend/db/schema/job';

interface Service {
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

interface ContainersResponse {
  composedContainers: {
    [key: string]: ComposedContainer;
  };
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
          <Container key={composeFile} composeFile={composeFile} containerData={containerData} />
        ))}
      </div>
    </div>
  );
};

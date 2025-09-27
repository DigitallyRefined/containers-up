import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Host } from '@/backend/db/schema/host';
import type { ContainersResponse } from '@/frontend/components/Layout';
import type { JobWithLogs } from '@/backend/db/schema/job';

// Query Keys
export const queryKeys = {
  hosts: ['hosts'] as const,
  containers: (hostName: string, sort?: string) => ['containers', hostName, sort] as const,
  composeFiles: (hostName: string) => ['composeFiles', hostName] as const,
  logs: (hostName: string) => ['logs', hostName] as const,
  job: (jobId: number) => ['job', jobId] as const,
} as const;

// API Functions
const api = {
  fetchHosts: async (): Promise<Host[]> => {
    const response = await fetch('/api/host');
    if (!response.ok) {
      throw new Error('Failed to fetch hosts');
    }
    return response.json();
  },

  fetchContainers: async (hostName: string, sort?: string): Promise<ContainersResponse> => {
    const url = `/api/host/${hostName}/containers${sort ? `?sort=${sort}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch containers: ${response.statusText}`);
    }
    return response.json();
  },

  fetchComposeFiles: async (hostName: string): Promise<string[]> => {
    const response = await fetch(`/api/host/${hostName}/compose`);
    if (!response.ok) {
      throw new Error('Failed to fetch compose files');
    }
    const data = await response.json();
    if (data.error && data.cause === 'NO_WORKING_FOLDER') {
      throw new Error('Working folder is not configured');
    }
    return Array.isArray(data) ? data : [];
  },

  fetchLogs: async (hostName: string): Promise<any[]> => {
    const response = await fetch(`/api/host/${hostName}/logs`);
    if (!response.ok) {
      throw new Error('Failed to fetch logs');
    }
    return response.json();
  },

  createHost: async (hostData: any): Promise<Host> => {
    const response = await fetch(`/api/host/${encodeURIComponent(hostData.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hostData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create host');
    }
    return response.json();
  },

  updateHost: async (hostData: any): Promise<Host> => {
    const response = await fetch(`/api/host/${encodeURIComponent(hostData.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hostData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update host');
    }
    return response.json();
  },

  deleteHost: async (hostName: string): Promise<void> => {
    const response = await fetch(`/api/host/${encodeURIComponent(hostName)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete host');
    }
  },

  triggerImageUpdate: async (hostName: string, checkService?: string): Promise<void> => {
    const response = await fetch(`/api/host/${hostName}/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(checkService ? { checkService } : {}),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to trigger image tag update check');
    }
  },

  restartJob: async (jobId: number): Promise<void> => {
    const response = await fetch(`/api/job/${jobId}`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to restart job');
    }
  },

  updateJob: async (jobId: number): Promise<void> => {
    const response = await fetch(`/api/job/${jobId}`, { method: 'PATCH' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update job');
    }
  },
};

// Custom Hooks
export const useHosts = () => {
  return useQuery({
    queryKey: queryKeys.hosts,
    queryFn: api.fetchHosts,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useContainers = (hostName: string, sort?: string) => {
  return useQuery({
    queryKey: queryKeys.containers(hostName, sort),
    queryFn: () => api.fetchContainers(hostName, sort),
    enabled: !!hostName,
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useComposeFiles = (hostName: string, enabled: boolean = false) => {
  return useQuery({
    queryKey: queryKeys.composeFiles(hostName),
    queryFn: () => api.fetchComposeFiles(hostName),
    enabled: enabled && !!hostName,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useLogs = (hostName: string, enabled: boolean = false) => {
  return useQuery({
    queryKey: queryKeys.logs(hostName),
    queryFn: () => api.fetchLogs(hostName),
    enabled: enabled && !!hostName,
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useCreateHost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.createHost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hosts });
    },
  });
};

export const useUpdateHost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.updateHost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hosts });
    },
  });
};

export const useDeleteHost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.deleteHost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hosts });
    },
  });
};

export const useTriggerImageUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ hostName, checkService }: { hostName: string; checkService?: string }) =>
      api.triggerImageUpdate(hostName, checkService),
    onSuccess: (_, { hostName }) => {
      // Invalidate containers for this host to refresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.containers(hostName),
        exact: false,
      });
    },
  });
};

export const useRestartJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.restartJob,
    onSuccess: () => {
      // Invalidate all containers queries to refresh job data
      queryClient.invalidateQueries({
        queryKey: ['containers'],
        exact: false,
      });
    },
  });
};

export const useUpdateJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.updateJob,
    onSuccess: () => {
      // Invalidate all containers queries to refresh job data
      queryClient.invalidateQueries({
        queryKey: ['containers'],
        exact: false,
      });
    },
  });
};

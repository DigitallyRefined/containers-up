import { useState, useEffect } from 'react';
import { BrushCleaning, PencilIcon, SortDesc, WifiSync } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useHosts, useTriggerImageUpdate } from '@/frontend/hooks/useApi';

import { version } from '@/../package.json';
import { Button } from '@/frontend/components/ui/Button';
import { HostSelector } from '@/frontend/components/Host/Selector';
import { HostDialog } from '@/frontend/components/Host/Dialog';
import { ContainerLayout } from '@/frontend/components/Layout';
import { ContainerRefreshProvider } from '@/frontend/components/Container/ContainerRefreshContext';
import { useLocalStorage } from '@/frontend/hooks/useLocalStorage';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import { LogsDialog } from '@/frontend/components/Container/LogsDialog';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';
import { ComposeFiles } from '@/frontend/components/Compose/Files';
import type { Host } from '@/backend/db/schema/host';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/Select';

import '@/frontend/index.css';
import '@/frontend/img/icon-containers-up.svg';
import '@/frontend/img/icon-containers-up.webp';

export function App() {
  const [selectedHost, setSelectedHost] = useLocalStorage<string | undefined>(
    'selectedHost',
    'global'
  );
  const [selectedSort, setSelectedSort] = useLocalStorage<string | undefined>(
    'selectedSort',
    'global'
  );

  // Use React Query to fetch hosts
  const { data: hosts = [], isLoading: hostsLoading, error: hostsError } = useHosts();
  const triggerImageUpdateMutation = useTriggerImageUpdate();
  const queryClient = useQueryClient();

  // Handle host selection logic when hosts data changes
  useEffect(() => {
    if (hostsLoading || hostsError) return;

    if (hosts.length === 0) {
      openAddDialog();
    } else {
      const params = new URLSearchParams(window.location.search);
      const hostFromUrl = params.get('host');
      if (hostFromUrl && hosts.some((host: Host) => host.name === hostFromUrl)) {
        setSelectedHost(hostFromUrl);
      } else if (selectedHost && hosts.some((host: Host) => host.name === selectedHost)) {
        setSelectedHost(selectedHost);
      } else if (hosts.length > 0) {
        setSelectedHost(String(hosts[0].name));
      }
    }
  }, [hosts, hostsLoading, hostsError, selectedHost]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');

  const handleCloseDialog = () => {
    setDialogOpen(false);
    if (dialogMode === 'add') {
      setSelectedHost(undefined);
    }
  };

  const openAddDialog = () => {
    setDialogMode('add');
    setDialogOpen(true);
  };

  const openEditDialog = () => {
    setDialogMode('edit');
    setDialogOpen(true);
  };

  const hasSelectedHost = selectedHost && selectedHost !== 'add';

  const selectedHostObj = hosts.find((r) => r.name === selectedHost);

  if (hostsError) {
    return (
      <div className='container mx-auto p-8 text-center relative'>
        <p className='text-red-500'>
          Error loading data. Check OIDC configuration: {String(hostsError.message)}
        </p>
      </div>
    );
  }

  return (
    <ContainerRefreshProvider>
      <div className='p-4 sm:p-6 md:p-8 text-center relative'>
        <div className='relative pb-7'>
          <h2 className='text-2xl font-bold mb-0 text-center'>
            {hasSelectedHost ? `Containers for ${selectedHost}` : 'Containers Up!'}
          </h2>
        </div>
        <div className='flex flex-col sm:flex-row gap-2 px-0 mx-0 w-full px-2 sm:px-4 md:px-6'>
          <div className='flex items-center gap-2 w-1/2 md:w-1/3 min-w-75 sm:min-w-50 md:min-w-80'>
            <HostSelector
              selected={selectedHost}
              setSelected={(value) => {
                if (value === 'add') {
                  openAddDialog();
                } else {
                  setSelectedHost(value);
                  const params = new URLSearchParams(window.location.search);
                  if (params.has('host')) {
                    params.delete('host');
                    window.history.replaceState(
                      {},
                      '',
                      `${window.location.pathname}?${params.toString()}`
                    );
                  }
                }
              }}
              hosts={hosts}
            />
            <Tooltip content='Edit Host'>
              <Button
                variant='outline'
                size='sm'
                disabled={!selectedHost || selectedHost === 'add'}
                onClick={openEditDialog}
                aria-label='Edit Host'
              >
                <PencilIcon className='size-4' />
              </Button>
            </Tooltip>
          </div>
          {hasSelectedHost && (
            <div className='flex items-center gap-2 w-1/2 md:w-2/3 md:justify-end'>
              <Select value={selectedSort || ''} onValueChange={setSelectedSort}>
                <Tooltip content='Sort by'>
                  <SelectTrigger className='min-w-30 max-w-30'>
                    <SelectValue placeholder='Sort by...' />
                  </SelectTrigger>
                </Tooltip>
                <SelectContent>
                  {['Updates', 'Uptime', 'Name'].map((sort) => (
                    <SelectItem key={sort} value={sort.toLowerCase()}>
                      <span className='inline-flex items-center gap-1'>
                        <SortDesc className='size-4 inline' /> {sort}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <StreamingDialog
                url={`/api/host/${selectedHost}/containers`}
                method='DELETE'
                dialogTitle='Cleanup'
                tooltipText='Cleanup'
              >
                <Button variant='outline' size='sm' aria-label='Cleanup'>
                  <BrushCleaning className='size-4' />
                </Button>
              </StreamingDialog>
              <Tooltip content='Check all image tags for updates'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    triggerImageUpdateMutation.mutate(
                      { hostName: selectedHost },
                      {
                        onSuccess: () => {
                          (window as any).showToast('Checking for image tag updates, see logs');
                        },
                        onError: (error) => {
                          (window as any).showToast(
                            error.message || 'Failed to trigger image tag update check'
                          );
                        },
                      }
                    );
                  }}
                  disabled={triggerImageUpdateMutation.isPending}
                  aria-label='Check all image tags for updates'
                >
                  <WifiSync className='size-4' />
                </Button>
              </Tooltip>
              <LogsDialog selectedHost={selectedHost} />
              <ComposeFiles hostName={selectedHost} />
            </div>
          )}
        </div>

        <ContainerLayout selectedHost={selectedHostObj} selectedSort={selectedSort} />

        <HostDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={`${dialogMode === 'add' ? 'Add New' : 'Edit'} Host`}
          initialValues={dialogMode === 'edit' ? selectedHostObj : undefined}
          onSuccess={() => {
            handleCloseDialog();
            queryClient.invalidateQueries();
          }}
        />

        <div className='text-center text-xs text-gray-500'>Containers Up! - {version}</div>
      </div>
    </ContainerRefreshProvider>
  );
}

export default App;

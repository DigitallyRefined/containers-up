import { useState, useEffect } from 'react';
import { BrushCleaning, PencilIcon } from 'lucide-react';

import { Button } from '@/frontend/components/ui/Button';
import { HostSelector } from '@/frontend/components/Host/Selector';
import { HostDialog } from '@/frontend/components/Host/Dialog';
import { ContainerLayout } from '@/frontend/components/Layout';
import { ContainerRefreshProvider } from '@/frontend/components/Container/ContainerRefreshContext';
import { useLocalStorage } from '@/frontend/lib/useLocalStorage';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import { LogsDialog } from '@/frontend/components/Container/LogsDialog';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';

import './index.css';
import './img/icon-containers-up.svg';
import './img/icon-containers-up.webp';

export function App() {
  const [selectedHost, setSelectedHost] = useLocalStorage<string | undefined>(
    'selectedHost',
    'global'
  );
  const [hosts, setHosts] = useState([]);

  const refreshHosts = () => {
    fetch('/api/host')
      .then((res) => res.json())
      .then((data) => {
        setHosts(data);
        if (data.length === 0) {
          openAddDialog();
        } else {
          if (selectedHost && data.some((host) => host.name === selectedHost)) {
            setSelectedHost(selectedHost);
          } else if (data.length > 0) {
            setSelectedHost(String(data[0].name));
          }
        }
      })
      .catch(() => {
        setSelectedHost('add');
      });
  };

  useEffect(() => {
    refreshHosts();
  }, []);

  // Unified dialog state
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

  return (
    <ContainerRefreshProvider>
      <div className='container mx-auto p-4 sm:p-6 md:p-8 text-center relative max-w-none'>
        <div className='relative pb-7'>
          <h2 className='text-2xl font-bold mb-0 text-center'>
            {hasSelectedHost ? `Containers for ${selectedHost}` : 'Containers Up!'}
          </h2>
        </div>
        <div className='px-2 sm:px-4 md:px-8'>
          <div className='flex items-center gap-2'>
            <HostSelector
              selected={selectedHost}
              setSelected={(value) => {
                if (value === 'add') {
                  openAddDialog();
                } else {
                  setSelectedHost(value);
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
            {hasSelectedHost && (
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
            )}
            <LogsDialog selectedHost={selectedHost} />
          </div>
        </div>

        <ContainerLayout selectedHost={selectedHost} />

        <HostDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={`${dialogMode === 'add' ? 'Add New' : 'Edit'} Host`}
          initialValues={dialogMode === 'edit' ? selectedHostObj : undefined}
          onSuccess={() => {
            handleCloseDialog();
            refreshHosts();
          }}
        />
      </div>
    </ContainerRefreshProvider>
  );
}

export default App;

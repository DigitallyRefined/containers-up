import { useState, useEffect } from 'react';
import { BrushCleaning, PencilIcon } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { RepoSelector } from '@/frontend/components/Repo/Selector';
import { RepoDialog } from '@/frontend/components/Repo/Dialog';
import { ContainerLayout } from '@/frontend/components/Layout';
import { ContainerRefreshProvider } from '@/frontend/components/Container/ContainerRefreshContext';
import { useLocalStorage } from './lib/useLocalStorage';
import { Tooltip } from '@/frontend/components/ui/tooltip';
import { LogsDialog } from '@/frontend/components/Container/LogsDialog';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';

import './index.css';
import './img/icon-containers-up.svg';
import './img/icon-containers-up.webp';

export function App() {
  const [selectedRepo, setSelectedRepo] = useLocalStorage<string | undefined>(
    'selectedRepo',
    'global'
  );
  const [repos, setRepos] = useState([]);

  const refreshRepos = () => {
    fetch('/api/repo')
      .then((res) => res.json())
      .then((data) => {
        setRepos(data);
        if (data.length === 0) {
          openAddDialog();
        } else {
          if (selectedRepo && data.some((repo) => repo.name === selectedRepo)) {
            setSelectedRepo(selectedRepo);
          } else if (data.length > 0) {
            setSelectedRepo(String(data[0].name));
          }
        }
      })
      .catch(() => {
        setSelectedRepo('add');
      });
  };

  useEffect(() => {
    refreshRepos();
  }, []);

  // Unified dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');

  const handleCloseDialog = () => {
    setDialogOpen(false);
    if (dialogMode === 'add') {
      setSelectedRepo(undefined);
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

  const hasSelectedRepo = selectedRepo && selectedRepo !== 'add';

  // Find the selected repo object
  const selectedRepoObj = repos.find((r) => r.name === selectedRepo);

  return (
    <ContainerRefreshProvider>
      <div className='container mx-auto p-4 sm:p-6 md:p-8 text-center relative max-w-none'>
        <div className='relative pb-7'>
          <h2 className='text-2xl font-bold mb-0 text-center'>
            {hasSelectedRepo ? `Containers for ${selectedRepo}` : 'Containers Up!'}
          </h2>
        </div>
        <div className='px-2 sm:px-4 md:px-8'>
          <div className='flex items-center gap-2'>
            <RepoSelector
              selected={selectedRepo}
              setSelected={(value) => {
                if (value === 'add') {
                  openAddDialog();
                } else {
                  setSelectedRepo(value);
                }
              }}
              repos={repos}
            />
            <Tooltip content='Edit Repository'>
              <Button
                variant='outline'
                size='sm'
                disabled={!selectedRepo || selectedRepo === 'add'}
                onClick={openEditDialog}
                aria-label='Edit Repository'
              >
                <PencilIcon className='size-4' />
              </Button>
            </Tooltip>
            {hasSelectedRepo && (
              <StreamingDialog
                url={`/api/repo/${selectedRepo}/containers`}
                method='DELETE'
                dialogTitle='Cleanup'
                tooltipText='Cleanup'
              >
                <Button variant='outline' size='sm' aria-label='Cleanup'>
                  <BrushCleaning className='size-4' />
                </Button>
              </StreamingDialog>
            )}
            <LogsDialog selectedRepo={selectedRepo} />
          </div>
          {hasSelectedRepo && (
            <div className='text-xs text-muted-foreground'>
              GitHub Webhook: <code>/api/webhook/github/repo/{selectedRepo}</code>
            </div>
          )}
        </div>

        <ContainerLayout selectedRepo={selectedRepo} />

        <RepoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={`${dialogMode === 'add' ? 'Add New' : 'Edit'} Repository`}
          initialValues={dialogMode === 'edit' ? selectedRepoObj : undefined}
          onSuccess={() => {
            handleCloseDialog();
            refreshRepos();
          }}
        />
      </div>
    </ContainerRefreshProvider>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { BrushCleaning } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { RepoSelector } from '@/frontend/components/Repo/Selector';
import { RepoDialog } from '@/frontend/components/Repo/Dialog';
import { ContainerLayout } from '@/frontend/components/Container/Layout';
import { ToastProvider } from '@/frontend/components/ui/toast';

import './index.css';

export function App() {
  const [selectedRepo, setSelectedRepo] = useState<string | undefined>(undefined);
  const [repos, setRepos] = useState([]);

  const refreshRepos = () => {
    fetch('/api/repo')
      .then((res) => res.json())
      .then((data) => {
        setRepos(data);
        if (data.length === 0) {
          openAddDialog();
        } else {
          const stored = localStorage.getItem('selectedRepo');
          if (stored && data.some((repo) => repo.name === stored)) {
            setSelectedRepo(stored);
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

  // Find the selected repo object
  const selectedRepoObj = repos.find((r) => r.name === selectedRepo);

  return (
    <ToastProvider>
      <div className='container mx-auto p-4 sm:p-6 md:p-8 text-center relative max-w-none'>
        <div className='relative pb-7'>
          <h2 className='text-2xl font-bold mb-0 text-center'>
            {selectedRepo ? `Containers for ${selectedRepo}` : 'Containers Up!'}
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
              refreshRepos={refreshRepos}
            />
            <Button
              variant='outline'
              size='sm'
              disabled={!selectedRepo || selectedRepo === 'add'}
              onClick={openEditDialog}
            >
              Edit
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={async () => {
                try {
                  const res = await fetch('/api/repo/hl/containers', { method: 'DELETE' });
                  if (res.ok) {
                    (window as any).showToast('Cleanup triggered!');
                  } else {
                    (window as any).showToast('Cleanup failed.');
                  }
                } catch (e) {
                  (window as any).showToast('Cleanup failed.');
                }
              }}
              aria-label='Cleanup'
            >
              <BrushCleaning className='size-4' />
            </Button>
          </div>
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
    </ToastProvider>
  );
}

export default App;

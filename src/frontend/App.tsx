import { useState, useEffect } from 'react';

import { Card, CardContent } from '@/frontend/components/ui/card';
import { Button } from '@/frontend/components/ui/button';
import { RepoSelector } from '@/frontend/components/Repo/Selector';
import { RepoDialog } from '@/frontend/components/Repo/Dialog';

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
    <div className='container mx-auto p-8 text-center relative'>
      <Card className='bg-card/50 backdrop-blur-sm border-muted'>
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
            className='ml-2'
            disabled={!selectedRepo || selectedRepo === 'add'}
            onClick={openEditDialog}
          >
            Edit
          </Button>
        </div>

        <CardContent className='pt-6'>
          <h1 className='text-5xl font-bold my-4 leading-tight'>Containers Up!</h1>
          <p>Show containers for {selectedRepo}</p>
        </CardContent>
      </Card>

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
  );
}

export default App;

import { useState, useEffect } from 'react';
import { Plus, Play } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { Dialog } from '../ui/dialog';
import { DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

export const ComposeFiles = ({ repoName }: { repoName: string }) => {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<string[] | 'loading' | 'error'>();

  useEffect(() => {
    if (open && repoName) {
      setFiles('loading');
      fetch(`/api/repo/${repoName}/compose`)
        .then((res) => res.json())
        .then((data) => {
          setFiles(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          setFiles('error');
        });
    }
  }, [open, repoName]);

  const handleRun = async (composeFile: string) => {
    setOpen(false);
    (window as any).showToast('Starting service from compose file...');

    try {
      const res = await fetch(`/api/repo/${repoName}/compose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ composeFile }),
      });
      if (res.ok) {
        (window as any).showToast('Service started from compose file!');
      } else {
        const data = await res.json().catch(() => ({}));
        (window as any).showToast(data.error || 'Failed to start service.');
      }
    } catch (err) {
      (window as any).showToast('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip content='Start service from a compose file'>
        <DialogTrigger asChild>
          <Button variant='outline' size='sm' aria-label='Start service from a compose file'>
            <Plus className='size-4' />
          </Button>
        </DialogTrigger>
      </Tooltip>
      <DialogContent className='w-full max-w-screen-lg max-h-[90vh]'>
        <DialogHeader>
          <DialogTitle>Compose Files</DialogTitle>
        </DialogHeader>
        <div className='space-y-2 max-h-[80vh] overflow-y-auto'>
          {files === 'loading' ? (
            <div className='text-muted-foreground'>Loading...</div>
          ) : files === 'error' ? (
            <div className='text-muted-foreground'>Failed to fetch compose files.</div>
          ) : files && files.length > 0 ? (
            <ul>
              {files.map((file, idx) => (
                <li key={idx}>
                  <a
                    href='#'
                    onClick={(e) => {
                      e.preventDefault();
                      handleRun(file);
                    }}
                    className='text-sm flex items-center gap-1 hover:underline'
                  >
                    <Play className='size-4' />
                    {file}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className='text-muted-foreground'>No compose files found.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

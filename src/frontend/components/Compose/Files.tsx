import { useState, useEffect } from 'react';
import { Plus, Play } from 'lucide-react';

import { Button } from '@/frontend/components/ui/Button';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import { Dialog } from '@/frontend/components/ui/Dialog';
import {
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/Dialog';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';

export const ComposeFiles = ({ hostName }: { hostName: string }) => {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<string[] | 'loading' | 'error' | 'noWorkingFolder'>();

  useEffect(() => {
    if (open && hostName) {
      setFiles('loading');
      fetch(`/api/host/${hostName}/compose`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error && data.cause === 'NO_WORKING_FOLDER') {
            setFiles('noWorkingFolder');
            return;
          }
          setFiles(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          setFiles('error');
        });
    }
  }, [open, hostName]);

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
          ) : files === 'noWorkingFolder' ? (
            <div className='text-muted-foreground'>
              Working folder is not set. Please set it in the host settings.
            </div>
          ) : files && files.length > 0 ? (
            <ul>
              {files.map((file, idx) => (
                <li key={idx} className='flex items-center gap-2'>
                  <StreamingDialog
                    url={`/api/host/${hostName}/compose`}
                    method='POST'
                    body={{ composeFile: file }}
                    dialogTitle={`Run Compose File: ${file}`}
                    tooltipText={file ? `Run ${file}` : undefined}
                  >
                    <a href='#' className='text-sm flex items-center gap-1 hover:underline'>
                      <Play className='size-4' />
                      <span className='text-sm'>{file}</span>
                    </a>
                  </StreamingDialog>
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

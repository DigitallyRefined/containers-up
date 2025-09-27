import { useState } from 'react';
import { Plus, Play } from 'lucide-react';
import { useComposeFiles } from '@/frontend/hooks/useApi';

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

  // Use React Query to fetch compose files
  const { data: files = [], isLoading, error, isError } = useComposeFiles(hostName, open);

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
          {isLoading ? (
            <div className='text-muted-foreground'>Loading...</div>
          ) : isError ? (
            <div className='text-muted-foreground'>
              {error?.message === 'Working folder is not configured'
                ? 'Working folder is not configured. Please set it in the host settings.'
                : 'Failed to fetch compose files.'}
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

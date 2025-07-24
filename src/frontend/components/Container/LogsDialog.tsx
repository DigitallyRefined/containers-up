import React, { useState, useEffect } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/Dialog';
import { Button } from '@/frontend/components/ui/Button';
import { Logs } from '@/frontend/components/Container/Logs';
import { LogsIcon } from 'lucide-react';
import { Tooltip } from '@/frontend/components/ui/Tooltip';

interface LogsDialogProps {
  selectedRepo: string | undefined;
}

export const LogsDialog: React.FC<LogsDialogProps> = ({ selectedRepo }) => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<any[] | 'error' | 'loading'>();

  useEffect(() => {
    if (open && selectedRepo) {
      setLogs('loading');
      fetch(`/api/repo/${selectedRepo}/logs`)
        .then((res) => res.json())
        .then((data) => {
          setLogs(data);
        })
        .catch(() => {
          setLogs('error');
        });
    }
  }, [open, selectedRepo]);

  if (!selectedRepo) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip content='Show logs'>
        <DialogTrigger asChild>
          <Button variant='outline' size='sm' aria-label='Show logs'>
            <LogsIcon className='size-4' />
          </Button>
        </DialogTrigger>
      </Tooltip>
      <DialogContent className='w-full max-w-screen-lg max-h-[90vh]'>
        <DialogHeader>
          <DialogTitle>Logs for {selectedRepo}</DialogTitle>
        </DialogHeader>
        <div className='space-y-2 max-h-[80vh] overflow-y-auto'>
          {logs === 'loading' ? (
            <div className='text-muted-foreground'>Loading logs...</div>
          ) : logs === 'error' ? (
            <div className='text-muted-foreground'>Failed to fetch logs.</div>
          ) : (
            logs?.map((log, logIndex) => <Logs key={logIndex} log={log} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

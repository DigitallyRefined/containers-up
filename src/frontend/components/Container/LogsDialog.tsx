import React, { useState } from 'react';

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
import { useLogs } from '@/frontend/hooks/useApi';

interface LogsDialogProps {
  selectedHost: string | undefined;
}

export const LogsDialog: React.FC<LogsDialogProps> = ({ selectedHost }) => {
  const [open, setOpen] = useState(false);

  // Use React Query to fetch logs
  const { data: logs = [], isLoading, error, isError } = useLogs(selectedHost || '', open);

  if (!selectedHost) return null;
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
          <DialogTitle>Logs for {selectedHost}</DialogTitle>
        </DialogHeader>
        <div className='space-y-2 max-h-[80vh] overflow-y-auto'>
          {isLoading ? (
            <div className='text-muted-foreground'>Loading logs...</div>
          ) : isError ? (
            <div className='text-muted-foreground'>Failed to fetch logs.</div>
          ) : Array.isArray(logs) && logs.length === 0 ? (
            <div className='text-muted-foreground'>No logs to display.</div>
          ) : (
            logs?.map((log, logIndex) => <Logs key={logIndex} log={log} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

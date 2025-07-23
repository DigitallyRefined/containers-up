import React, { useState, useRef } from 'react';
import { useContainerRefresh } from '@/frontend/components/Container/ContainerRefreshContext';
import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/dialog';
import { Tooltip } from '@/frontend/components/ui/tooltip';
import { Spinner } from '@/frontend/components/ui/spinner';

interface StreamingDialogProps {
  url: string;
  method?: string;
  body?: any;
  dialogTitle: string;
  children: ReactNode;
  tooltipText?: string;
}

export const StreamingDialog: React.FC<StreamingDialogProps> = ({
  url,
  method = 'GET',
  body,
  dialogTitle,
  children,
  tooltipText,
}) => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const { refresh } = useContainerRefresh();

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLogs([]);
      setStatus('loading');
      abortRef.current = new AbortController();
      try {
        const fetchOptions: RequestInit = {
          method,
          signal: abortRef.current.signal,
        };
        if (body) {
          fetchOptions.headers = { 'Content-Type': 'application/json' };
          fetchOptions.body = JSON.stringify(body);
        }
        const res = await fetch(url, fetchOptions);
        if (!res.body) {
          // Fallback: not streamable, just parse as JSON
          const data = await res.json();
          setLogs(Array.isArray(data) ? data.map(String) : [JSON.stringify(data)]);
          setStatus('done');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';
          setLogs((prev) => [...prev, ...lines.filter(Boolean)]);
        }
        if (buffer) setLogs((prev) => [...prev, buffer]);
        setStatus('done');
      } catch (e) {
        if ((e as any).name === 'AbortError') return;
        setStatus('error');
      }
    } else if (!isOpen && abortRef.current) {
      abortRef.current.abort();
      refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {tooltipText ? (
        <Tooltip content={tooltipText}>
          <DialogTrigger asChild>{children}</DialogTrigger>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{children}</DialogTrigger>
      )}
      <DialogContent className='w-full max-w-screen-lg max-h-[90vh]'>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className='space-y-2 max-h-[80vh] overflow-y-auto text-left font-mono text-xs bg-muted p-2 rounded'>
          {status === 'error' && <div className='text-destructive'>Failed to fetch data.</div>}
          {logs.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
          {status === 'done' && logs.length === 0 && (
            <div className='text-muted-foreground'>No output.</div>
          )}
        </div>
        {status === 'loading' && <Spinner />}
      </DialogContent>
    </Dialog>
  );
};

export default StreamingDialog;

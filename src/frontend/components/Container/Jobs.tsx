import { useState } from 'react';
import { GitPullRequestArrow, GitPullRequest, RefreshCcwIcon, LogsIcon } from 'lucide-react';

import { Card, CardContent } from '@/frontend/components/ui/card';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Button } from '@/frontend/components/ui/button';
import { type JobWithLogs } from '@/backend/db/schema/job';
import { getRelativeTime } from '@/frontend/lib/utils';
import { Link } from '@/frontend/components/ui/link';
import { Logs } from '@/frontend/components/Container/Logs';
import { Tooltip } from '@/frontend/components/ui/tooltip';

export const RepoPrLink = ({
  repoPr,
  url,
  status,
}: {
  repoPr: string;
  url: string;
  status: string;
}) => {
  const isClosed = status === 'completed';
  const Icon = isClosed ? GitPullRequest : GitPullRequestArrow;
  const iconColor = isClosed ? '#8250df' : '#1a7f37';
  if (url) {
    return (
      <Link href={url}>
        <Icon className='' color={iconColor} size={16} />
        {repoPr}
      </Link>
    );
  }
  return (
    <span className='inline-flex items-center gap-1'>
      <Icon color={iconColor} size={16} />
      {repoPr}
    </span>
  );
};

export const Jobs = ({ job }: { job: JobWithLogs }) => {
  const [openJobId, setOpenJobId] = useState<number | null>(null);
  const [restarting, setRestarting] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'opened':
        return 'bg-blue-100 text-blue-700 border-2 border-orange-300 font-bold';
      case 'running':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'text-gray-800';
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      const res = await fetch(`/api/job/${job.id}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        (window as any).showToast(data.error || 'Failed to restart job');
      } else {
        (window as any).showToast('Job restart requested!');
      }
    } catch (err) {
      (window as any).showToast('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setRestarting(false);
    }
  };

  let prUrl = '';
  const prUrlMatch = job.repoPr.match(/^([^\/]+\/[^#]+)#(\d+)$/);
  if (prUrlMatch) {
    const [, repo, prId] = prUrlMatch;
    prUrl = `https://github.com/${repo}/pull/${prId}`;
  }

  return (
    <Card key={job.id}>
      <CardContent className='p-2 sm:p-3 md:p-4 relative'>
        {/* Status badge in top right, blended into border */}
        <span
          className={`absolute -top-2 -right-1 text-xs px-2 py-1 rounded-xl z-10 border border-gray-200 shadow-sm ${getStatusColor(
            job.status
          )}`}
          style={{ boxShadow: '0 1px 2px rgba(16,30,54,0.04)' }}
        >
          {job.status}
        </span>
        <div className='my-2'>
          <h5 className='font-medium text-sm text-center w-full'>
            <Link href={prUrl}>{job.title}</Link>
          </h5>
        </div>
        <p className='text-xs  mb-2'>
          PR: <RepoPrLink repoPr={job.repoPr} url={prUrl} status={job.status} />
        </p>
        <p className='text-xs '>{getRelativeTime(`${job.updated}Z`)}</p>
        {job.logs.length > 0 && (
          <div className='mt-3 w-full flex items-center justify-center gap-2'>
            <Dialog
              open={openJobId === job.id}
              onOpenChange={(open) => setOpenJobId(open ? job.id : null)}
            >
              <Tooltip content='View Logs'>
                <DialogTrigger asChild>
                  <Button variant='outline' size='sm' aria-label='View Logs'>
                    <LogsIcon className='size-4' />
                  </Button>
                </DialogTrigger>
              </Tooltip>
              <DialogContent className='w-full max-w-screen-lg max-h-[90vh]'>
                <DialogHeader>
                  <DialogTitle>Logs for {job.title}</DialogTitle>
                </DialogHeader>
                <div className='space-y-2 max-h-[80vh] overflow-y-auto'>
                  {job.logs.map((log, logIndex) => (
                    <Logs key={logIndex} log={log} />
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            {job.status !== 'opened' && (
              <Tooltip content='Restart Job'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleRestart}
                  disabled={restarting}
                  aria-label='Restart Job'
                >
                  <RefreshCcwIcon className='size-4' />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

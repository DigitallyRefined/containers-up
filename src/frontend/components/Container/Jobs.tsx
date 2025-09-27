import { useEffect, useState } from 'react';
import {
  GitPullRequestArrow,
  GitPullRequest,
  RotateCcw,
  LogsIcon,
  Tags,
  Check,
  CloudDownload,
} from 'lucide-react';

import { Card, CardContent } from '@/frontend/components/ui/Card';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/Dialog';
import { Button } from '@/frontend/components/ui/Button';
import { JobStatus, type JobWithLogs } from '@/backend/db/schema/job';
import { getRelativeTime } from '@/frontend/lib/utils';
import { Link } from '@/frontend/components/ui/Link';
import { Logs } from '@/frontend/components/Container/Logs';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';

export const RepoPrLink = ({
  repoPr,
  url,
  status,
}: {
  repoPr: string;
  url: string;
  status: JobStatus;
}) => {
  const isClosed = status === JobStatus.completed || status === JobStatus.closed;
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

export const Jobs = ({
  job,
  hostName,
  composeFile,
}: {
  job: JobWithLogs;
  hostName: string;
  composeFile: string;
}) => {
  const [openJobId, setOpenJobId] = useState<number | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (job.title.includes('containers-up') && job.status === JobStatus.running) {
      fetch(`/api/job/${job.id}`, { method: 'PATCH' });
    }
  }, [job.id, job.status, job.title]);

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case JobStatus.open:
        return 'bg-blue-100 text-blue-700 border-2 border-orange-300 font-bold';
      case JobStatus.queued:
      case JobStatus.running:
        return 'bg-yellow-100 text-yellow-800';
      case JobStatus.completed:
        return 'bg-green-100 text-green-800';
      case JobStatus.closed:
      case JobStatus.failed:
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
  const prUrlMatch = job.repoPr?.match(/^([^\/]+\/[^#]+)#(\d+)$/);
  if (prUrlMatch) {
    const [, repo, prId] = prUrlMatch;
    prUrl = `https://github.com/${repo}/pull/${prId}`;
  }

  let shaUpdate = job.title.match(/Bump (.*) from .* to `(.*)`/);
  let imageSha: string | undefined;
  if (shaUpdate) {
    imageSha = `${shaUpdate[1]}@sha256:${shaUpdate[2]}`;
  }

  const renderTitleWithCode = (title: string) => {
    const parts = title.split(/`([^`]+)`/);
    return parts.map((part, index) => 
      index % 2 === 1 ? <code key={index}>{part}</code> : part
    );
  };

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
          {JobStatus[job.status]}
        </span>
        <div className='my-2'>
          <h5 className='font-medium text-sm text-center w-full break-all'>
            {prUrl ? (
              <Link href={prUrl}>{renderTitleWithCode(job.title)}</Link>
            ) : (
              renderTitleWithCode(job.title)
            )}
          </h5>
        </div>
        {job.repoPr && (
          <p className='text-xs  mb-2'>
            PR: <RepoPrLink repoPr={job.repoPr} url={prUrl} status={job.status} />
          </p>
        )}
        <p className='text-xs '>{getRelativeTime(`${job.updated}Z`)}</p>
        <div className='mt-3 w-full flex items-center justify-center gap-2'>
          {!job.repoPr && (
            <StreamingDialog
              url={`/api/host/${hostName}/compose`}
              method='PUT'
              body={{ composeFile, pullFirst: true, jobTitle: job.title, jobFolder: job.folder }}
              dialogTitle='Pull image & restart'
              tooltipText='Pull image & restart'
            >
              <Button variant='outline' size='sm' aria-label='Pull image & restart'>
                <CloudDownload className='size-4' />
              </Button>
            </StreamingDialog>
          )}

          {job.logs.length > 0 && (
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
          )}

          {imageSha && (
            <StreamingDialog
              url='/api/docker-hub/tags'
              method='POST'
              body={{ image: imageSha }}
              shouldRefreshOnClose={false}
              dialogTitle='Find Docker tags'
              tooltipText='Find Docker tags'
            >
              <Button variant='outline' size='sm' aria-label='Find Docker tags'>
                <Tags className='size-4' />
              </Button>
            </StreamingDialog>
          )}

          {job.repoPr && (
            <Tooltip content='Restart Job'>
              <Button
                variant='outline'
                size='sm'
                onClick={
                  job.status === JobStatus.open
                    ? () => {
                        window.open(
                          `https://github.com/${job.repoPr.split('/')[0]}/${
                            job.repoPr.split('/')[1].split('#')[0]
                          }/settings/hooks`,
                          '_blank'
                        );
                      }
                    : handleRestart
                }
                disabled={restarting}
                aria-label='Restart Job'
              >
                <RotateCcw className='size-4' />
              </Button>
            </Tooltip>
          )}

          {job.status === JobStatus.running && (
            <StreamingDialog
              url={`/api/job/${job.id}`}
              method='PATCH'
              dialogTitle='Mark as completed'
              tooltipText='Mark as completed'
            >
              <Button variant='outline' size='sm' aria-label='Mark as completed'>
                <Check className='size-4' />
              </Button>
            </StreamingDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

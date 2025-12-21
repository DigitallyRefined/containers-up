import { ContainerIcon, PowerOff, RotateCcw, Trash } from 'lucide-react';
import type { Service } from '@/frontend/components/Layout';
import { Button } from '@/frontend/components/ui/Button';
import { Card, CardContent } from '@/frontend/components/ui/Card';
import { Link } from '@/frontend/components/ui/Link';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import { getContainerStatusColor, getRelativeTime } from '@/frontend/lib/utils';

export const Container = ({ service, hostName }: { service: Service; hostName: string }) => {
  return (
    <Card>
      <CardContent className="p-2 pt-4 sm:p-3 md:p-4 relative flex flex-col">
        <ContainerIcon size={16} className="absolute top-4 right-4 opacity-80 z-0" />
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <StreamingDialog
            url={`/api/host/${hostName}/container/${service.Id}`}
            method="POST"
            dialogTitle={`Restart: ${service.Name}`}
            tooltipText="Restart this container"
          >
            <Button variant="outline" size="sm" aria-label="Restart">
              <RotateCcw className="size-4" />
            </Button>
          </StreamingDialog>
          {service.State.Status === 'running' ? (
            <StreamingDialog
              url={`/api/host/${hostName}/container/${service.Id}`}
              method="PUT"
              dialogTitle={`Stop: ${service.Name}`}
              tooltipText="Stop this container"
            >
              <Button variant="outline" size="sm" aria-label="Stop">
                <PowerOff className="size-4" />
              </Button>
            </StreamingDialog>
          ) : (
            <StreamingDialog
              url={`/api/host/${hostName}/container/${service.Id}`}
              method="DELETE"
              dialogTitle={`Delete: ${service.Name}`}
              tooltipText="Delete this container"
            >
              <Button variant="outline" size="sm" aria-label="Delete">
                <Trash className="size-4" />
              </Button>
            </StreamingDialog>
          )}
        </div>
        <h5 className="font-semibold text-sm mb-2 break-all pb-2">{service.Name}</h5>
        <p className="text-xs break-all">{service.Config.Image.split('@')[0]}</p>
        <p
          className={`text-xs font-medium ${getContainerStatusColor(
            service.State.Status,
            service.State.Health?.Status
          )}`}
        >
          Status: {service.State.Status}{' '}
          {service.State.Health?.Status && `(${service.State.Health.Status})`}
        </p>
        {service.State.StartedAt && (
          <Tooltip content={service.State.StartedAt.split('.')[0]}>
            <p className="text-xs">{getRelativeTime(service.State.StartedAt)}</p>
          </Tooltip>
        )}
        {service.urls && service.urls.length > 0 && (
          <div className="mt-2">
            {service.urls.map((url, urlIndex) => (
              <Link key={urlIndex} href={url} className="text-xs">
                {url}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

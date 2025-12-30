import { Bot, Logs, PowerOff, RotateCcw, WifiSync } from 'lucide-react';
import type { Host } from '@/backend/db/schema/host';
import type { JobWithLogs } from '@/backend/db/schema/job';
import { Jobs } from '@/frontend/components/Container/Jobs';
import type { Service } from '@/frontend/components/Layout';
import { Button } from '@/frontend/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/Card';
import { Link } from '@/frontend/components/ui/Link';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import { useTriggerImageUpdate } from '@/frontend/hooks/useApi';
import { getContainerStatusColor, getRelativeTime } from '@/frontend/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/Accordion';

interface ComposedContainerProps {
  composeFolder: string;
  services: Service[];
  jobs?: JobWithLogs[];
  host: Host;
  hideViewDependabot?: boolean;
  hideCheckForUpdates?: boolean;
  openAccordionItems?: string[];
  onAccordionChange?: (value: string[]) => void;
}

export const ComposedContainer = ({
  composeFolder,
  services,
  jobs,
  host,
  hideViewDependabot = false,
  hideCheckForUpdates = false,
  openAccordionItems = [],
  onAccordionChange,
}: ComposedContainerProps) => {
  const hostName = host.name;
  const triggerImageUpdateMutation = useTriggerImageUpdate();
  return (
    <Card key={composeFolder} className="my-2 relative">
      <div className="absolute -top-3 -right-1 flex gap-1 z-10">
        <StreamingDialog
          url={`/api/host/${hostName}/compose`}
          method="PUT"
          body={{ composeFolder }}
          dialogTitle={`Restart: ${composeFolder}`}
          tooltipText="Restart all containers in this compose file"
        >
          <Button variant="outline" size="sm" aria-label="Restart">
            <RotateCcw className="size-4" />
          </Button>
        </StreamingDialog>

        <StreamingDialog
          url={`/api/host/${hostName}/compose`}
          method="DELETE"
          body={{ composeFolder }}
          dialogTitle={`Stop: ${composeFolder}`}
          tooltipText="Stop all containers in this compose file"
        >
          <Button variant="outline" size="sm" aria-label="Stop">
            <PowerOff className="size-4" />
          </Button>
        </StreamingDialog>

        {host.botType === 'dependabot' && !hideViewDependabot && (
          <Tooltip content="Dependabot updates">
            <Button
              variant="outline"
              size="sm"
              aria-label="Dependabot updates"
              onClick={() => {
                window.open(
                  `https://github.com/${host.repo}/network/updates#:~:text=${encodeURIComponent(
                    composeFolder
                  ).replace(/-/g, '%2D')}`
                );
              }}
            >
              <Bot className="size-4" />
            </Button>
          </Tooltip>
        )}
      </div>
      <CardHeader>
        <CardTitle className="text-left break-all">{composeFolder}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-lg font-medium mb-3 text-left">Services</h4>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service, index) => (
              <Card key={index}>
                <CardContent className="p-2 pt-4 sm:p-3 md:p-4 relative">
                  <img
                    src={`/icons/${service.Config.Labels['com.docker.compose.service']}.webp`}
                    alt={service.Config.Labels['com.docker.compose.service']}
                    className="absolute top-4 left-4 w-8 opacity-80 z-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                  <div className="absolute -top-3 -right-1 flex gap-1 z-10">
                    {!hideCheckForUpdates && (
                      <Tooltip content="Check for image tag updates">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            triggerImageUpdateMutation.mutate(
                              { hostName, checkService: service.Config.Image },
                              {
                                onSuccess: () => {
                                  (window as any).showToast(
                                    'Checking for image tag updates, see logs'
                                  );
                                },
                                onError: (error) => {
                                  (window as any).showToast(
                                    error.message || 'Failed to trigger image tag update check'
                                  );
                                },
                              }
                            );
                          }}
                          disabled={triggerImageUpdateMutation.isPending}
                          aria-label="Check for image tag updates"
                        >
                          <WifiSync className="size-4" />
                        </Button>
                      </Tooltip>
                    )}
                    <StreamingDialog
                      url={`/api/host/${hostName}/container/${service.Name.replaceAll(
                        '/',
                        ''
                      )}/logs`}
                      dialogTitle={`Logs for: ${service.Config.Labels['com.docker.compose.service']}`}
                      tooltipText="View container logs"
                    >
                      <Button variant="outline" size="sm" aria-label="View container logs">
                        <Logs className="size-4" />
                      </Button>
                    </StreamingDialog>
                  </div>
                  <h5 className="font-semibold text-sm mb-2 break-all pb-2">
                    {service.Config.Labels['com.docker.compose.service']}
                  </h5>
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
                      <ul>
                        {service.urls.map((url, urlIndex) => (
                          <li key={urlIndex}>
                            <Link href={url} className="text-xs">
                              {url}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {jobs && jobs.length > 0 && (
          <Accordion type="multiple" value={openAccordionItems} onValueChange={onAccordionChange}>
            <AccordionItem value="updates">
              <AccordionTrigger className="text-lg font-medium text-left">Updates</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {jobs.map((job) => (
                    <Jobs
                      key={job.id}
                      job={job}
                      hostName={hostName}
                      composeFolder={composeFolder}
                      repoHost={host.repoHost}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

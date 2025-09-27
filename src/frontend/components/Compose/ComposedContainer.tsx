import { RotateCcw, PowerOff, Bot, WifiSync } from 'lucide-react';
import { useTriggerImageUpdate } from '@/frontend/hooks/useApi';

import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/Card';
import type { Service } from '@/frontend/components/Layout';
import { Jobs } from '@/frontend/components/Container/Jobs';
import { getRelativeTime } from '@/frontend/lib/utils';
import { Link } from '@/frontend/components/ui/Link';
import { JobWithLogs } from '@/backend/db/schema/job';
import { Button } from '@/frontend/components/ui/Button';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';
import { getContainerStatusColor } from '@/frontend/lib/utils';
import { Tooltip } from '@/frontend/components/ui/Tooltip';
import type { Host } from '@/backend/db/schema/host';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/Accordion';

interface ComposedContainerProps {
  cardTitle: string;
  services: Service[];
  jobs?: JobWithLogs[];
  host: Host;
  hideViewDependabot?: boolean;
  openAccordionItems?: string[];
  onAccordionChange?: (value: string[]) => void;
}

export const ComposedContainer = ({
  cardTitle,
  services,
  jobs,
  host,
  hideViewDependabot = false,
  openAccordionItems = [],
  onAccordionChange,
}: ComposedContainerProps) => {
  const hostName = host.name;
  const triggerImageUpdateMutation = useTriggerImageUpdate();
  return (
    <Card key={cardTitle} className='my-2'>
      <CardHeader className='flex flex-row items-center justify-between'>
        <CardTitle className='text-left break-all'>{cardTitle}</CardTitle>
        <div className='flex gap-2'>
          <StreamingDialog
            url={`/api/host/${hostName}/compose`}
            method='PUT'
            body={{ composeFile: cardTitle }}
            dialogTitle={`Restart: ${cardTitle}`}
            tooltipText='Restart all containers in this compose file'
          >
            <Button variant='outline' size='sm' aria-label='Restart'>
              <RotateCcw className='size-4' />
            </Button>
          </StreamingDialog>

          <StreamingDialog
            url={`/api/host/${hostName}/compose`}
            method='DELETE'
            body={{ composeFile: cardTitle }}
            dialogTitle={`Stop: ${cardTitle}`}
            tooltipText='Stop all containers in this compose file'
          >
            <Button variant='outline' size='sm' aria-label='Stop'>
              <PowerOff className='size-4' />
            </Button>
          </StreamingDialog>

          {!hideViewDependabot && (
            <Tooltip content='Dependabot updates'>
              <Button
                variant='outline'
                size='sm'
                aria-label='Dependabot updates'
                onClick={() => {
                  window.open(
                    `https://github.com/${host.repo}/network/updates#:~:text=${encodeURIComponent(
                      cardTitle
                    ).replace(/-/g, '%2D')}`
                  );
                }}
              >
                <Bot className='size-4' />
              </Button>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div>
          <h4 className='text-lg font-medium mb-3 text-left'>Services</h4>
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {services.map((service, index) => (
              <Card key={index}>
                <CardContent className='p-2 sm:p-3 md:p-4 relative'>
                  <img
                    src={`/icons/${service.Config.Labels['com.docker.compose.service']}.webp`}
                    alt={service.Config.Labels['com.docker.compose.service']}
                    className='absolute top-4 left-4 w-8 opacity-80 z-0'
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                  <div className='absolute top-2 right-2 flex gap-1 z-10'>
                    <Tooltip content='Check for image tag updates'>
                      <Button
                        variant='outline'
                        size='sm'
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
                        aria-label='Check for image tag updates'
                      >
                        <WifiSync className='size-4' />
                      </Button>
                    </Tooltip>
                  </div>
                  <h5 className='font-semibold text-sm mb-2'>
                    {service.Config.Labels['com.docker.compose.service']}
                  </h5>
                  <p className='text-xs break-all'>{service.Config.Image.split('@')[0]}</p>
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
                    <p className='text-xs'>{getRelativeTime(service.State.StartedAt)}</p>
                  )}
                  {service.urls && service.urls.length > 0 && (
                    <div className='mt-2'>
                      <ul>
                        {service.urls.map((url, urlIndex) => (
                          <li key={urlIndex}>
                            <Link href={url} className='text-xs'>
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
          <Accordion type='multiple' value={openAccordionItems} onValueChange={onAccordionChange}>
            <AccordionItem value='updates'>
              <AccordionTrigger className='text-lg font-medium text-left'>Updates</AccordionTrigger>
              <AccordionContent>
                <div className='grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3'>
                  {jobs.map((job) => (
                    <Jobs key={job.id} job={job} hostName={hostName} composeFile={cardTitle} />
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

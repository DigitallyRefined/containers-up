import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import type { Service } from '@/frontend/components/Layout';
import { Jobs } from '@/frontend/components/Container/Jobs';
import { getRelativeTime } from '@/frontend/lib/utils';
import { Link } from '@/frontend/components/ui/link';
import { JobWithLogs } from '@/backend/db/schema/job';

interface ComposedContainerProps {
  cardTitle: string;
  services: Service[];
  jobs?: JobWithLogs[];
}

export const ComposedContainer = ({ cardTitle, services, jobs }: ComposedContainerProps) => {
  return (
    <Card key={cardTitle}>
      <CardHeader>
        <CardTitle className='text-left'>{cardTitle}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Services Section */}
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
                  <h5 className='font-semibold text-sm mb-2'>
                    {service.Config.Labels['com.docker.compose.service']}
                  </h5>
                  <p className='text-xs break-all'>{service.Config.Image.split('@')[0]}</p>
                  <p
                    className={`text-xs font-medium ${
                      service.State.Status === 'running' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    Status: {service.State.Status}{' '}
                    {service.State.Health?.Status && `(${service.State.Health.Status})`}
                  </p>
                  <p className='text-xs'>{getRelativeTime(service.State.StartedAt)}</p>
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
          <div>
            <h4 className='text-lg font-medium mb-3 text-left'>Updates</h4>
            <div className='grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3'>
              {jobs.map((job) => (
                <Jobs key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

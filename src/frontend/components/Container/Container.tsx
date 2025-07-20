import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import type { ComposedContainer } from '@/frontend/components/Container/Layout';
import { Jobs } from '@/frontend/components/Container/Jobs';
import { getRelativeTime } from '@/frontend/lib/utils';
import { Link } from '../ui/link';

export const Container = ({
  composeFile,
  containerData,
}: {
  composeFile: string;
  containerData: ComposedContainer;
}) => {
  return (
    <Card key={composeFile}>
      <CardHeader>
        <CardTitle className='text-left'>{composeFile}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Services Section */}
        <div>
          <h4 className='text-lg font-medium mb-3 text-left'>Services</h4>
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {containerData.services.map((service, index) => (
              <Card key={index}>
                <CardContent className='p-2 sm:p-3 md:p-4 relative'>
                  <img
                    src={`/icons/${service.Config.Labels['com.docker.compose.service']}.webp`}
                    alt={service.Config.Labels['com.docker.compose.service']}
                    className='absolute top-4 left-4 w-8 opacity-80 z-0'
                  />
                  <h5 className='font-semibold text-sm mb-2'>
                    {service.Config.Labels['com.docker.compose.service']}
                  </h5>
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
                      {service.urls.map((url, urlIndex) => (
                        <Link key={urlIndex} href={url} className='text-xs'>
                          {url}
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Jobs Section */}
        {containerData.jobs.length > 0 && (
          <div>
            <h4 className='text-lg font-medium mb-3 text-left'>Updates</h4>
            <div className='grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3'>
              {containerData.jobs.map((job) => (
                <Jobs key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

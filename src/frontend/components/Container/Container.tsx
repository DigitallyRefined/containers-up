import { ContainerIcon } from 'lucide-react';

import { Card, CardContent } from '@/frontend/components/ui/card';
import { Link } from '@/frontend/components/ui/link';
import type { Service } from '@/frontend/components/Container/Layout';
import { getRelativeTime } from '@/frontend/lib/utils';

export const Container = ({ service }: { service: Service }) => {
  return (
    <Card>
      <CardContent className='p-2 sm:p-3 md:p-4 relative flex flex-col'>
        <ContainerIcon size={16} className='absolute top-4 right-4 opacity-80 z-0' />
        <h5 className='font-semibold text-sm mb-2'>{service.Name}</h5>
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
  );
};

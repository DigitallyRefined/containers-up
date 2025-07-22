import { PackageIcon } from 'lucide-react';

import { Card, CardContent } from '@/frontend/components/ui/card';
import { getRelativeTime } from '@/frontend/lib/utils';
import type { Image } from '@/frontend/components/Layout';

export const ContainerImage = ({ image }: { image: Image }) => {
  return (
    <Card>
      <CardContent className='p-2 sm:p-3 md:p-4 relative'>
        <PackageIcon size={16} className='absolute top-4 right-4 opacity-80 z-0' />
        <h5 className='font-semibold text-sm mb-2'>
          {image.Repository}:{image.Tag}
        </h5>
        <p className='text-xs'>ID: {image.ID.replace('sha256:', '').slice(0, 12)}</p>
        <p className='text-xs'>Size: {image.Size} MB</p>
        <p className='text-xs'>Created: {getRelativeTime(image.CreatedAt)}</p>
      </CardContent>
    </Card>
  );
};

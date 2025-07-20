import { PackageIcon } from 'lucide-react';

import { Card, CardContent } from '@/frontend/components/ui/card';
import { getRelativeTime } from '@/frontend/lib/utils';
import type { Images } from '@/frontend/components/Container/Layout';

export const ContainerImage = ({ image }: { image: Images }) => {
  return (
    <Card>
      <CardContent className='p-2 sm:p-3 md:p-4 relative'>
        <PackageIcon size={16} className='absolute top-4 right-4 opacity-80 z-0' />
        <h5 className='font-semibold text-sm mb-2'>
          {image.Repository}:{image.Tag}
        </h5>
        <p className='text-xs'>Size: {image.Size} MB</p>
        <p className='text-xs'>Created: {getRelativeTime(image.CreatedAt)}</p>
      </CardContent>
    </Card>
  );
};

import { PackageIcon, Trash } from 'lucide-react';

import { Card, CardContent } from '@/frontend/components/ui/Card';
import { getRelativeTime } from '@/frontend/lib/utils';
import type { Image } from '@/frontend/components/Layout';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';
import { Button } from '@/frontend/components/ui/Button';

type ContainerImageProps = { image: Image; hostName: string };

export const ContainerImage = ({ image, hostName }: ContainerImageProps) => {
  const imageId = image.ID.replace('sha256:', '').slice(0, 12);
  return (
    <Card>
      <CardContent className='p-2 sm:p-3 md:p-4 relative'>
        <PackageIcon size={16} className='absolute top-4 right-4 opacity-80 z-0' />
        <div className='absolute top-2 right-2 flex gap-1 z-10'>
          <StreamingDialog
            url={`/api/host/${hostName}/image/${imageId}`}
            method='DELETE'
            dialogTitle={`Delete Image: ${image.Repository}:${image.Tag}`}
            tooltipText='Delete this image'
          >
            <Button variant='outline' size='sm' aria-label='Delete'>
              <Trash className='size-4' />
            </Button>
          </StreamingDialog>
        </div>
        <h5 className='font-semibold text-sm mb-2 break-all'>
          {image.Repository}:{image.Tag}
        </h5>
        <p className='text-xs'>ID: <code>{imageId}</code></p>
        <p className='text-xs'>Size: {image.Size} MB</p>
        <p className='text-xs'>Created: {getRelativeTime(image.CreatedAt)}</p>
      </CardContent>
    </Card>
  );
};

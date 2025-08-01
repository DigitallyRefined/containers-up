import { Button } from '@/frontend/components/ui/Button';
import { LabeledInput } from '@/frontend/components/ui/Input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { hostSchema } from '@/backend/db/schema/host';
import { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/Dialog';
import { Info } from 'lucide-react';

export const HostForm = ({
  onSuccess,
  initialValues,
  onAlert,
  onDeleteConfirm,
}: {
  onSuccess?: () => void;
  initialValues?: Partial<z.infer<typeof hostSchema>>;
  onAlert?: (alert: { open: boolean; message: string; type: 'success' | 'error' }) => void;
  onDeleteConfirm?: (confirm: { open: boolean; name: string }) => void;
}) => {
  type HostForm = z.infer<typeof hostSchema>;

  function normalizeNulls<T extends object>(obj?: T): T {
    if (!obj) return {} as T;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === null ? '' : v])) as T;
  }

  const normalizedInitialValues = normalizeNulls(initialValues);

  const lastSuccess = useRef(false);

  const onSubmit = async (data: HostForm) => {
    try {
      const res = await fetch(`/api/host/${encodeURIComponent(data.name)}`, {
        method: initialValues ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) {
        onAlert?.({
          open: true,
          message: result.error || 'Failed to save host',
          type: 'error',
        });
        lastSuccess.current = false;
        return;
      }
      reset();
      onAlert?.({ open: true, message: 'Host saved!', type: 'success' });
      onSuccess?.();
      lastSuccess.current = true;
    } catch (err) {
      onAlert?.({ open: true, message: 'Error saving host: ' + err, type: 'error' });
      lastSuccess.current = false;
    }
  };

  const onDelete = async () => {
    if (!initialValues?.name) return;

    // Show confirmation dialog
    onDeleteConfirm?.({ open: true, name: initialValues.name });
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<HostForm>({
    resolver: zodResolver(hostSchema),
    defaultValues: normalizedInitialValues,
  });

  useEffect(() => {
    if (initialValues) {
      reset(normalizeNulls(initialValues));
    }
  }, [initialValues, reset]);

  const watchedName = watch('name');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='space-y-4 text-left'>
      {initialValues?.id && <input type='hidden' {...register('id')} />}
      <LabeledInput
        label='Name'
        id='name'
        type='text'
        required
        placeholder='e.g. my-host'
        error={errors.name?.message}
        disabled={isSubmitting}
        {...register('name')}
      />
      <LabeledInput
        label='SSH Hostname'
        id='sshHost'
        type='text'
        required
        placeholder='e.g. user@example.com'
        error={errors.sshHost?.message}
        disabled={isSubmitting}
        {...register('sshHost')}
      />
      <LabeledInput
        label='SSH Private Key'
        id='sshKey'
        type='textarea'
        required
        placeholder='Paste your SSH private key here'
        error={errors.sshKey?.message}
        disabled={isSubmitting}
        {...register('sshKey')}
      />
      <LabeledInput
        label='Working Folder'
        id='workingFolder'
        type='text'
        placeholder='e.g. /home/user/stacks'
        error={errors.workingFolder?.message}
        disabled={isSubmitting}
        {...register('workingFolder')}
      />
      <LabeledInput
        label='Exclude Folders regex'
        id='excludeFolders'
        type='text'
        placeholder='e.g. (manual|test)'
        error={undefined}
        disabled={isSubmitting}
        {...register('excludeFolders')}
      />
      <LabeledInput
        label='GitHub Repository'
        id='repo'
        type='text'
        placeholder='e.g. user/repo (without https://github.com/)'
        error={errors.repo?.message}
        disabled={isSubmitting}
        {...register('repo')}
      />
      <LabeledInput
        label={
          <>
            GitHub Webhook Secret
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='Show GitHub Webhook URL'
                  className='cursor-pointer'
                >
                  <Info className='size-4' />
                </Button>
              </DialogTrigger>
              <DialogContent className='max-w-xs'>
                <DialogHeader>
                  <DialogTitle>GitHub Webhook URL</DialogTitle>
                </DialogHeader>
                <div className='text-xs break-all'>
                  <code>/api/webhook/github/host/{watchedName}</code>
                </div>
                <div className='mt-2 text-xs text-muted-foreground'>
                  Use this URL as the webhook endpoint in your GitHub repository settings.
                </div>
              </DialogContent>
            </Dialog>
          </>
        }
        id='webhookSecret'
        type='text'
        placeholder='Copy from GitHub Webhook settings page'
        error={errors.webhookSecret?.message}
        disabled={isSubmitting}
        {...register('webhookSecret')}
      />
      <Button type='submit' className='w-full font-semibold mt-4' disabled={isSubmitting}>
        {isSubmitting ? 'Testing connection...' : 'Save Host'}
      </Button>
      {initialValues && (
        <Button
          variant='outline'
          className='w-full font-semibold text-destructive'
          disabled={isSubmitting}
          onClick={onDelete}
          type='button'
        >
          Delete Host
        </Button>
      )}
    </form>
  );
};

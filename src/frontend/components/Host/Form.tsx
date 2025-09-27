import { Button } from '@/frontend/components/ui/Button';
import { LabeledInput } from '@/frontend/components/ui/Input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { hostSchema, hostEditSchema } from '@/backend/db/schema/host';
import { useEffect, useRef } from 'react';
import { useCreateHost, useUpdateHost } from '@/frontend/hooks/useApi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/Dialog';
import { Info, MailQuestionMark, Save, Trash2 } from 'lucide-react';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';

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
  type HostEditForm = z.infer<typeof hostEditSchema>;

  function normalizeNulls<T extends object>(obj?: T): T {
    if (!obj) return {} as T;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === null ? '' : v])) as T;
  }

  const normalizedInitialValues = normalizeNulls(initialValues);

  const lastSuccess = useRef(false);
  const createHostMutation = useCreateHost();
  const updateHostMutation = useUpdateHost();

  const onSubmit = async (data: HostForm | HostEditForm) => {
    const mutation = initialValues ? updateHostMutation : createHostMutation;

    mutation.mutate(data, {
      onSuccess: () => {
        reset();
        onAlert?.({ open: true, message: 'Host saved!', type: 'success' });
        onSuccess?.();
        lastSuccess.current = true;
      },
      onError: (error) => {
        onAlert?.({
          open: true,
          message: error.message || 'Failed to save host',
          type: 'error',
        });
        lastSuccess.current = false;
      },
    });
  };

  const onDelete = async () => {
    if (!initialValues?.name) return;

    // Show confirmation dialog
    onDeleteConfirm?.({ open: true, name: initialValues.name });
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<HostForm | HostEditForm>({
    resolver: zodResolver(initialValues ? hostEditSchema : hostSchema),
    defaultValues: normalizedInitialValues,
  });

  const isSubmitting = createHostMutation.isPending || updateHostMutation.isPending;

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
        placeholder='Shared GitHub webhook secret from settings page'
        error={errors.webhookSecret?.message}
        disabled={isSubmitting}
        {...register('webhookSecret')}
      />
      <LabeledInput
        label={
          <span className='inline-flex items-center gap-1'>
            Check for image tag updates schedule (cronjob)
            <a
              href='https://it-tools.tech/crontab-generator'
              target='_blank'
              rel='noopener noreferrer'
              className='ml-1 align-middle'
            >
              <Info className='size-4' />
            </a>
          </span>
        }
        id='cron'
        type='text'
        placeholder='e.g. 0 1 * * 6 (every Saturday at 1am)'
        disabled={isSubmitting}
        {...register('cron')}
      />
      <LabeledInput
        label='Sort Order'
        id='sortOrder'
        type='number'
        placeholder='e.g. 1 (lower numbers appear first)'
        error={errors.sortOrder?.message}
        disabled={isSubmitting}
        {...register('sortOrder', { valueAsNumber: true })}
      />
      <Button type='submit' className='w-full font-semibold mt-4' disabled={isSubmitting}>
        <Save className='size-4' />
        {isSubmitting ? 'Testing connection...' : 'Save host'}
      </Button>
      {initialValues && (
        <>
          <StreamingDialog
            url={`/api/host/${initialValues.name}/notification/test`}
            method='POST'
            dialogTitle='Test notification output'
          >
            <Button
              variant='outline'
              className='w-full font-semibold'
              disabled={isSubmitting}
              type='button'
            >
              <MailQuestionMark className='size-4' />
              Send test notification
            </Button>
          </StreamingDialog>
          <Button
            variant='outline'
            className='w-full font-semibold text-destructive'
            disabled={isSubmitting}
            onClick={onDelete}
            type='button'
          >
            <Trash2 className='size-4' />
            Delete host
          </Button>
        </>
      )}
    </form>
  );
};

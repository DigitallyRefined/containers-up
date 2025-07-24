import { Button } from '@/frontend/components/ui/Button';
import { LabeledInput } from '@/frontend/components/ui/Input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { repoSchema } from '@/backend/db/schema/repo';
import { useEffect, useRef } from 'react';

export const RepoForm = ({
  onSuccess,
  initialValues,
  onAlert,
  onDeleteConfirm,
}: {
  onSuccess?: () => void;
  initialValues?: Partial<z.infer<typeof repoSchema>>;
  onAlert?: (alert: { open: boolean; message: string; type: 'success' | 'error' }) => void;
  onDeleteConfirm?: (confirm: { open: boolean; name: string }) => void;
}) => {
  type RepoForm = z.infer<typeof repoSchema>;

  const lastSuccess = useRef(false);

  const onSubmit = async (data: RepoForm) => {
    try {
      const res = await fetch(`/api/repo/${encodeURIComponent(data.name)}`, {
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
          message: result.error || 'Failed to save repository',
          type: 'error',
        });
        lastSuccess.current = false;
        return;
      }
      reset();
      onAlert?.({ open: true, message: 'Repository saved!', type: 'success' });
      onSuccess?.();
      lastSuccess.current = true;
    } catch (err) {
      onAlert?.({ open: true, message: 'Error saving repository: ' + err, type: 'error' });
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
  } = useForm<RepoForm>({
    resolver: zodResolver(repoSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    if (initialValues) {
      reset(initialValues);
    }
  }, [initialValues, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='space-y-4 text-left'>
      {initialValues && <input type='hidden' {...register('id')} />}
      <LabeledInput
        label='Name'
        id='name'
        type='text'
        placeholder='e.g. my-repo'
        error={errors.name?.message}
        {...register('name')}
      />
      <LabeledInput
        label='SSH Hostname'
        id='sshCmd'
        type='text'
        placeholder='e.g. user@example.com'
        error={errors.sshCmd?.message}
        {...register('sshCmd')}
      />
      <LabeledInput
        label='SSH Key'
        id='sshKey'
        type='textarea'
        placeholder='Paste your SSH private key here'
        error={errors.sshKey?.message}
        {...register('sshKey')}
      />
      <LabeledInput
        label='GitHub Repository'
        id='repo'
        type='text'
        placeholder='e.g. user/repo (without https://github.com/)'
        error={errors.repo?.message}
        {...register('repo')}
      />
      <LabeledInput
        label='Webhook Secret'
        id='webhookSecret'
        type='text'
        placeholder='Copy from webhook settings'
        error={errors.webhookSecret?.message}
        {...register('webhookSecret')}
      />
      <LabeledInput
        label='Working Folder'
        id='workingFolder'
        type='text'
        placeholder='e.g. /home/debian/stacks'
        error={errors.workingFolder?.message}
        {...register('workingFolder')}
      />
      <LabeledInput
        label='Exclude Folders regex (optional)'
        id='excludeFolders'
        type='text'
        placeholder='e.g. (manual|test)'
        error={undefined}
        {...register('excludeFolders')}
      />
      <Button type='submit' className='w-full font-semibold mt-4' disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Repository'}
      </Button>
      {initialValues && (
        <Button
          variant='outline'
          className='w-full font-semibold text-destructive'
          disabled={isSubmitting}
          onClick={onDelete}
          type='button'
        >
          Delete Repository
        </Button>
      )}
    </form>
  );
};

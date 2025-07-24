import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/components/ui/Dialog';
import { HostForm } from '@/frontend/components/Host/Form';
import { z } from 'zod';
import { hostSchema } from '@/backend/db/schema/host';
import { useState, useRef } from 'react';
import { Button } from '@/frontend/components/ui/Button';

interface HostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValues?: Partial<z.infer<typeof hostSchema>>;
  onSuccess: () => void;
}

export const HostDialog = ({
  open,
  onOpenChange,
  title,
  initialValues,
  onSuccess,
}: HostDialogProps) => {
  const [alert, setAlert] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>(
    { open: false, message: '', type: 'success' }
  );

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; name: string }>({
    open: false,
    name: '',
  });

  const lastSuccess = useRef(false);

  const handleAlert = (alertData: {
    open: boolean;
    message: string;
    type: 'success' | 'error';
  }) => {
    setAlert(alertData);
    if (alertData.type === 'success') {
      lastSuccess.current = true;
    }
  };

  const handleDeleteConfirm = (confirmData: { open: boolean; name: string }) => {
    setDeleteConfirm(confirmData);
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`/api/host/${encodeURIComponent(deleteConfirm.name)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await res.json();
      if (!res.ok) {
        setAlert({
          open: true,
          message: result.error || 'Failed to delete host',
          type: 'error',
        });
        lastSuccess.current = false;
        return;
      }

      setAlert({ open: true, message: 'Host deleted!', type: 'success' });
      lastSuccess.current = true;
    } catch (err) {
      setAlert({ open: true, message: 'Error deleting host: ' + err, type: 'error' });
      lastSuccess.current = false;
    } finally {
      setDeleteConfirm({ open: false, name: '' });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Configure host settings for container management.</DialogDescription>
          </DialogHeader>
          <div className='py-4'>
            <HostForm
              initialValues={initialValues}
              onSuccess={onSuccess}
              onAlert={handleAlert}
              onDeleteConfirm={handleDeleteConfirm}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={alert.open}
        onOpenChange={(open) => {
          setAlert((a) => ({ ...a, open }));
          if (!open && lastSuccess.current) {
            lastSuccess.current = false;
            onSuccess();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{alert.type === 'success' ? 'Success' : 'Error'}</DialogTitle>
            <DialogDescription>
              {alert.type === 'success'
                ? 'Operation completed successfully.'
                : 'An error occurred during the operation.'}
            </DialogDescription>
          </DialogHeader>
          <div className={alert.type === 'error' ? 'text-destructive' : 'text-green-600'}>
            {alert.message}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirm.open}
        onOpenChange={(open) => {
          setDeleteConfirm((d) => ({ ...d, open }));
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              This action will permanently delete the host and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <p>Are you sure you want to delete the host "{deleteConfirm.name}"?</p>
            <p className='text-sm text-muted-foreground'>This action cannot be undone.</p>
            <div className='flex gap-2 justify-end'>
              <Button variant='outline' onClick={() => setDeleteConfirm({ open: false, name: '' })}>
                Cancel
              </Button>
              <Button variant='destructive' onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

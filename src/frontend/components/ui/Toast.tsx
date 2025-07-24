import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');

  // Expose a global function to show toast
  React.useEffect(() => {
    (window as any).showToast = (msg: string) => {
      setMessage(msg);
      setOpen(false);
      setTimeout(() => setOpen(true), 10);
    };
  }, []);

  return (
    <ToastPrimitive.Provider swipeDirection='right'>
      {children}
      <ToastPrimitive.Root
        open={open}
        onOpenChange={setOpen}
        className='fixed bottom-4 right-4 bg-zinc-900 dark:bg-white border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl px-4 py-3 z-50'
      >
        <ToastPrimitive.Title className='font-medium text-zinc-100 dark:text-zinc-900'>
          {message}
        </ToastPrimitive.Title>
      </ToastPrimitive.Root>
      <ToastPrimitive.Viewport className='fixed bottom-4 right-4 flex flex-col gap-2 w-96 max-w-full z-50' />
    </ToastPrimitive.Provider>
  );
} 
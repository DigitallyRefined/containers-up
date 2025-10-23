/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { App } from '@/frontend/App';
import { ToastProvider } from '@/frontend/components/ui/Toast';
import { handleCallbackIfPresent } from '@/frontend/auth/oidc';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const elem = document.getElementById('root')!;

const start = async () => {
  // Handle OIDC callback if present
  try {
    await handleCallbackIfPresent();
  } catch (error) {
    console.error('OIDC callback error:', error);
  }

  const app = (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </ToastProvider>
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </StrictMode>
  );

  if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
  } else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(app);
  }
};

start();

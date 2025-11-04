import { Loader2 } from 'lucide-react';
import type React from 'react';

export const Spinner: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <Loader2 className={`animate-spin ${className}`} />
);

export default Spinner;

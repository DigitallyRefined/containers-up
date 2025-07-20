import { cn } from '@/frontend/lib/utils';

export const Link = ({
  href,
  children,
  className,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100 underline inline-flex items-center gap-1',
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
};

import * as React from 'react';

import { cn } from '@/frontend/lib/utils';

const commonClasses =
  'border-input dark:border-gray-700 placeholder:text-muted-foreground/70 selection:bg-primary selection:text-primary-foreground aria-invalid:outline-destructive/60 aria-invalid:ring-destructive/20 dark:aria-invalid:outline-destructive dark:aria-invalid:ring-destructive/50 ring-ring/10 dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 aria-invalid:border-destructive/60 flex w-full min-w-0 rounded-md border bg-black/1 dark:bg-black/3 px-3 py-1 text-base shadow-xs transition-[color,box-shadow] focus-visible:ring-4 focus-visible:outline-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:focus-visible:ring-[3px] aria-invalid:focus-visible:outline-none md:text-sm dark:aria-invalid:focus-visible:ring-4';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(
        commonClasses,
        'h-9 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={props.rows || 8}
      className={cn(commonClasses, 'resize-none', className)}
      {...props}
    />
  );
}

type LabeledInput = {
  label: string | React.ReactNode;
  id: string;
  error?: string;
  className?: string;
  labelClassName?: string;
  containerClassName?: string;
  required?: boolean;
};

type LabeledInputProps =
  | ({
      type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url';
    } & React.ComponentProps<'input'> &
      LabeledInput)
  | ({ type: 'textarea' } & React.ComponentProps<'textarea'> & LabeledInput);

export function LabeledInput(props: LabeledInputProps) {
  const { label, id, error, className, labelClassName, containerClassName, required, ...rest } =
    props;
  const labelContent = (
    <>
      {label} {required && <span className='text-destructive'>*</span>}
    </>
  );

  if (props.type === 'textarea') {
    const textareaProps = rest as React.ComponentProps<'textarea'>;
    return (
      <div className={containerClassName}>
        <label htmlFor={id} className={labelClassName ?? 'block font-medium mb-1'}>
          {labelContent}
        </label>
        <Textarea id={id} className={className} {...textareaProps} aria-invalid={!!error} />
        {error && <p className='text-destructive text-sm mt-1'>{error}</p>}
      </div>
    );
  }

  const inputProps = rest as React.ComponentProps<'input'>;
  return (
    <div className={containerClassName}>
      <label htmlFor={id} className={labelClassName ?? 'block font-medium mb-1'}>
        {labelContent}
      </label>
      <Input id={id} className={className} {...inputProps} aria-invalid={!!error} />
      {error && <p className='text-destructive text-sm mt-1'>{error}</p>}
    </div>
  );
}

export { Input };

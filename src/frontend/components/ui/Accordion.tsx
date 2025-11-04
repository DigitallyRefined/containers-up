import * as RadixAccordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import React from 'react';
import { cn } from '@/frontend/lib/utils';

const Accordion = RadixAccordion.Root;
const AccordionItem = RadixAccordion.Item;
const AccordionContent = RadixAccordion.Content;

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof RadixAccordion.Trigger>
>(({ children, className, ...props }, ref) => (
  <RadixAccordion.Header asChild>
    <RadixAccordion.Trigger
      ref={ref}
      className={cn(
        'flex w-full items-center gap-2 py-4 font-medium transition-all hover:underline group',
        className
      )}
      {...props}
    >
      <ChevronDown className="mr-2 h-4 w-4 shrink-0 transition-transform duration-200 -rotate-90 group-data-[state=open]:rotate-0" />
      <span>{children}</span>
    </RadixAccordion.Trigger>
  </RadixAccordion.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

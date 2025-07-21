import * as RadixTooltip from '@radix-ui/react-tooltip';
import * as React from 'react';

interface TooltipProps extends React.ComponentProps<typeof RadixTooltip.Root> {
  content: React.ReactNode;
  children: React.ReactElement;
}

export function Tooltip({ content, children, ...rootProps }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const longPressTimeout = React.useRef<NodeJS.Timeout | null>(null);
  const closeTimeout = React.useRef<NodeJS.Timeout | null>(null);
  const isTouch = React.useRef(false);

  // Handlers for long press
  const handleTouchStart = (e: React.TouchEvent) => {
    isTouch.current = true;
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
    longPressTimeout.current = setTimeout(() => {
      setOpen(true);
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    isTouch.current = false;
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
    }
    closeTimeout.current = setTimeout(() => {
      setOpen(false);
    }, 2000); // 2 seconds after release
  };

  const handleTouchCancel = handleTouchEnd;

  // Clone the child to add touch handlers
  const child = children as React.ReactElement<any>;
  const trigger = React.cloneElement(child, {
    onTouchStart: (e: React.TouchEvent<any>) => {
      child.props.onTouchStart?.(e);
      handleTouchStart(e);
    },
    onTouchEnd: (e: React.TouchEvent<any>) => {
      child.props.onTouchEnd?.(e);
      handleTouchEnd();
    },
    onTouchCancel: (e: React.TouchEvent<any>) => {
      child.props.onTouchCancel?.(e);
      handleTouchCancel();
    },
  });

  return (
    <RadixTooltip.Root
      delayDuration={500}
      open={isTouch.current ? open : undefined}
      onOpenChange={isTouch.current ? setOpen : undefined}
      {...rootProps}
    >
      <RadixTooltip.Trigger asChild>{trigger}</RadixTooltip.Trigger>
      <RadixTooltip.Content
        side='top'
        align='center'
        className='z-50 px-2 py-1 rounded bg-black text-white text-xs shadow'
      >
        {content}
      </RadixTooltip.Content>
    </RadixTooltip.Root>
  );
}

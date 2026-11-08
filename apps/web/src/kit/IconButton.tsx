import { useRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { InkOutline } from './InkOutline';
import { useTooltip } from './Tooltip';
import type { IconName } from './Icon';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  icon: IconName;
  label: string;
}

export function IconButton({ icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { triggerProps, tip } = useTooltip(label, ref);
  return (
    <>
      <button
        ref={ref}
        type={type}
        className={['key', 'icon-btn', className].filter(Boolean).join(' ')}
        aria-label={label}
        {...rest}
        {...triggerProps}
      >
        <InkOutline radius="var(--radius-key)" />
        <Icon name={icon} />
      </button>
      {tip}
    </>
  );
}

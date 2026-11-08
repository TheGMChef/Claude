import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { InkOutline } from './InkOutline';
import type { IconName } from './Icon';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  icon: IconName;
  label: string;
}

export function IconButton({ icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={['key', 'icon-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <InkOutline radius="var(--radius-key)" />
      <Icon name={icon} />
    </button>
  );
}

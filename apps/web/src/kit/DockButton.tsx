import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { InkOutline } from './InkOutline';

export interface DockButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  label: string;
}

export function DockButton({ icon, label, className, type = 'button', ...rest }: DockButtonProps) {
  return (
    <button
      type={type}
      className={['key', 'dock-btn', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <InkOutline radius="var(--radius-key-lg)" />
      <Icon name={icon} size={22} />
      <span className="dock-btn__label">{label}</span>
    </button>
  );
}

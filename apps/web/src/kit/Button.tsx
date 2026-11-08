import type { ButtonHTMLAttributes } from 'react';
import { InkOutline } from './InkOutline';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline' | 'dashed';
  size?: 'md' | 'lg';
}

export function Button({
  variant = 'solid',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {variant !== 'solid' && <InkOutline radius={size === 'lg' ? 18 : 999} />}
      {children}
    </button>
  );
}

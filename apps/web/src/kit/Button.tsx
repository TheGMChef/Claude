import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { InkOutline } from './InkOutline';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline' | 'dashed';
  size?: 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'solid', size = 'md', className, type = 'button', children, ...rest },
  ref,
) {
  const cls = ['key', 'btn', `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {variant !== 'solid' && (
        <InkOutline
          radius={size === 'lg' ? 'var(--radius-key-lg)' : 'var(--radius-key)'}
          dashed={variant === 'dashed'}
        />
      )}
      {children}
    </button>
  );
});

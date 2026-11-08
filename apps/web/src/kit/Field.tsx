import { useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldBase {
  label: string;
  hand?: boolean;
}

export type FieldProps = FieldBase &
  (
    | ({ multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
    | ({ multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  );

export function Field(props: FieldProps) {
  const id = useId();
  const { label, hand = false, multiline, className, ...rest } = props;
  const cls = ['field__control', hand && 'field__control--hand', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className={cls}
          rows={4}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input id={id} className={cls} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
    </div>
  );
}

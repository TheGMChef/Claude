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
  const { label, hand = false, multiline, className, id: idProp, ...rest } = props;
  const controlId = idProp ?? id;
  const cls = ['field__control', hand && 'field__control--hand', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={controlId} className="field__label">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={controlId}
          className={cls}
          rows={4}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={controlId}
          className={cls}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </div>
  );
}

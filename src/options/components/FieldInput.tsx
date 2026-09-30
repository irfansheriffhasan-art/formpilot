import type { FieldInputType } from '../../profiles/profileSchema';

interface FieldInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputType?: FieldInputType;
  hint?: string;
  error?: string;
  wide?: boolean;
}

/**
 * One labelled input with an optional hint and error message.
 *
 * Accessibility detail: `aria-describedby` links the input to its hint and
 * error text, so screen readers announce them when the input is focused.
 * `aria-invalid` marks the field as having an error (and our CSS colors
 * its border using that same attribute).
 */
export function FieldInput({
  id,
  label,
  value,
  onChange,
  inputType = 'text',
  hint,
  error,
  wide,
}: FieldInputProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label className="field__label" htmlFor={id}>{label}</label>
      {inputType === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type={inputType}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint && <p className="field__hint" id={hintId}>{hint}</p>}
      {error && <p className="field__error" id={errorId}>{error}</p>}
    </div>
  );
}

import type { TargetOption } from '../../profiles/targets';
import type { FormField } from '../../types/formField';
import type { FieldMapping, TargetKey, UnavailableReason } from '../../types/mapping';
import type { FillStatus } from '../../types/messages';

/** What the user picked in the "Fill with" dropdown. */
export type Override = TargetKey | 'none';

const LEVEL_TEXT = { high: 'Ready', medium: 'Confirm', low: 'Not sure' } as const;

const UNAVAILABLE_TEXT: Record<UnavailableReason, string> = {
  'no-match': 'No matching profile field',
  'other-person': 'Someone else’s details',
  'no-value': 'Not in your profile',
  'no-option': 'No matching choice',
  'too-long': 'Value too long for this field',
  'read-only': 'Read-only',
  ignored: 'You chose not to fill this',
  'no-profile': 'No profile selected',
};

const FILL_TEXT: Record<FillStatus, string> = {
  filled: 'Filled',
  'not-found': 'Field is no longer on the page',
  'not-allowed': 'Not allowed',
  'needs-confirmation': 'Needs confirmation',
  'not-visible': 'Field is hidden now, so it wasn’t filled',
  'read-only': 'Field became read-only',
  'no-option': 'Choice not found',
  error: 'Couldn’t fill',
};

/** Shows only the last 4 characters of sensitive values: "•••• 9012". */
function preview(mapping: FieldMapping): string {
  const text = mapping.displayValue ?? '';
  if (!mapping.sensitive) return text;
  return text.length <= 4 ? '••••' : `•••• ${text.slice(-4)}`;
}

interface FieldRowProps {
  field: FormField;
  mapping: FieldMapping;
  targetName: string | null;
  included: boolean;
  fillable: boolean;
  override: Override | undefined;
  targets: TargetOption[];
  fillStatus: FillStatus | undefined;
  onIncludeChange: (included: boolean) => void;
  onOverrideChange: (override: Override | undefined) => void;
}

/** One field in the analysis list: what it is, what we'd fill, and why. */
export function FieldRow(props: FieldRowProps) {
  const { field, mapping, targetName, included, fillable, override, targets, fillStatus } = props;
  const label = field.label ?? 'Unlabelled field';
  const checkboxId = `include-${field.elementId}`;

  return (
    <li className={`row row--${fillable ? mapping.level : 'none'}`}>
      <input
        id={checkboxId}
        className="row__check"
        type="checkbox"
        checked={included}
        disabled={!fillable}
        onChange={(event) => props.onIncludeChange(event.target.checked)}
        aria-label={`Fill “${label}”`}
      />
      <div className="row__body">
        <div className="row__head">
          <label htmlFor={checkboxId} className="row__label">
            {label}
            {field.required && <span className="row__required" aria-label="required"> *</span>}
          </label>
          {fillable && <span className={`badge badge--${mapping.level}`}>{LEVEL_TEXT[mapping.level]}</span>}
          {mapping.sensitive && <span className="badge badge--sensitive">Sensitive</span>}
          {mapping.source === 'memory' && <span className="badge badge--learned">Learned</span>}
        </div>

        {fillable ? (
          <p className="row__value">
            <span className="row__target">{targetName}:</span> <span className="row__preview">{preview(mapping)}</span>
          </p>
        ) : (
          <p className="row__value row__value--none">{mapping.unavailable ? UNAVAILABLE_TEXT[mapping.unavailable] : 'Won’t fill'}</p>
        )}

        {fillStatus && (
          <p className={`row__status${fillStatus === 'filled' ? ' is-ok' : ' is-bad'}`}>{FILL_TEXT[fillStatus]}</p>
        )}

        <details className="row__why">
          <summary>Why? / Change</summary>
          <ul>
            {mapping.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            {fillable && <li>Confidence {Math.round(mapping.confidence * 100)}%.</li>}
          </ul>
          <label className="row__override">
            Fill with
            <select
              value={override ?? ''}
              onChange={(event) => props.onOverrideChange((event.target.value || undefined) as Override | undefined)}
            >
              <option value="">Automatic choice</option>
              <option value="none">Don’t fill this field</option>
              {targets.map((target) => (
                <option key={target.key} value={target.key}>{target.label}</option>
              ))}
            </select>
          </label>
        </details>
      </div>
    </li>
  );
}

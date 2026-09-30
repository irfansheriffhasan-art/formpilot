import type { ValidationErrors } from '../../profiles/profileManager';
import type { CustomField } from '../../profiles/profileTypes';

interface CustomFieldsEditorProps {
  fields: CustomField[];
  errors: ValidationErrors;
  onChange: (fields: CustomField[]) => void;
}

/**
 * Editable list of user-defined fields.
 *
 * Every operation returns a NEW array (map / filter / spread) instead of
 * changing the old one, for the same reason as setProfileValue: React
 * detects changes by comparing object identity.
 */
export function CustomFieldsEditor({ fields, errors, onChange }: CustomFieldsEditorProps) {
  function update(id: string, patch: Partial<CustomField>) {
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  function add() {
    onChange([...fields, { id: crypto.randomUUID(), label: '', value: '', sensitive: false }]);
  }

  function remove(id: string) {
    onChange(fields.filter((field) => field.id !== id));
  }

  return (
    <fieldset className="section">
      <legend className="section__title">Custom fields</legend>
      <p className="section__description">
        Anything else forms ask for, like a university registration number.
        Name each field the way a form would describe it.
      </p>

      {fields.length > 0 && (
        <ul className="custom-list">
          {fields.map((field) => {
            const error = errors[`custom:${field.id}`];
            return (
              // `key` must be the stable id, not the array index. With index
              // keys, removing row 1 would make React reuse row 1's inputs
              // for row 2's data, scrambling what's on screen.
              <li key={field.id} className="custom-row">
                <label className="custom-row__cell">
                  <span className="field__label">Field name</span>
                  <input
                    value={field.label}
                    placeholder="University registration number"
                    aria-invalid={Boolean(error)}
                    onChange={(event) => update(field.id, { label: event.target.value })}
                  />
                </label>
                <label className="custom-row__cell">
                  <span className="field__label">Value</span>
                  <input
                    value={field.value}
                    aria-invalid={Boolean(error)}
                    onChange={(event) => update(field.id, { value: event.target.value })}
                  />
                </label>
                <label className="custom-row__check">
                  <input
                    type="checkbox"
                    checked={field.sensitive}
                    onChange={(event) => update(field.id, { sensitive: event.target.checked })}
                  />
                  Ask before filling
                </label>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => remove(field.id)}
                  aria-label={`Remove ${field.label || 'this custom field'}`}
                >
                  Remove
                </button>
                {error && <p className="field__error custom-row__error" role="alert">{error}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="button button--quiet" onClick={add}>
        Add custom field
      </button>
    </fieldset>
  );
}

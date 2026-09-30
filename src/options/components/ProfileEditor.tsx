import type { ValidationErrors } from '../../profiles/profileManager';
import {
  fieldsForSection,
  getProfileValue,
  PROFILE_SECTIONS,
  setProfileValue,
} from '../../profiles/profileSchema';
import type { UserProfile } from '../../profiles/profileTypes';
import { CustomFieldsEditor } from './CustomFieldsEditor';
import { FieldInput } from './FieldInput';

interface ProfileEditorProps {
  draft: UserProfile;
  errors: ValidationErrors;
  isDirty: boolean;
  busy: boolean;
  onChange: (next: UserProfile) => void;
  onSave: () => void;
  onDelete: () => void;
}

/**
 * The profile form. Notice there is no hard-coded list of inputs here:
 * it loops over PROFILE_SECTIONS and PROFILE_FIELDS from profileSchema.ts.
 * Add a field to the schema and it appears in this editor automatically.
 *
 * This component never saves anything itself. It reports every change
 * upward through onChange, and OptionsApp decides what to do with it.
 */
export function ProfileEditor({
  draft,
  errors,
  isDirty,
  busy,
  onChange,
  onSave,
  onDelete,
}: ProfileEditorProps) {
  function copyCurrentToPermanent() {
    onChange({ ...draft, permanentAddress: { ...draft.currentAddress } });
  }

  return (
    <form
      className="editor"
      noValidate
      onSubmit={(event) => {
        // Stop the browser's default page reload; we save through storage.
        event.preventDefault();
        onSave();
      }}
    >
      <FieldInput
        id="profileName"
        label="Profile name"
        hint="For example: Personal, College, Father."
        value={draft.profileName}
        error={errors.profileName}
        onChange={(value) => onChange({ ...draft, profileName: value })}
      />

      {PROFILE_SECTIONS.map((section) => (
        <fieldset key={section.key} className="section">
          <legend className="section__title">{section.title}</legend>
          {section.description && <p className="section__description">{section.description}</p>}

          {section.key === 'permanentAddress' && (
            <button type="button" className="button button--quiet section__action" onClick={copyCurrentToPermanent}>
              Copy current address
            </button>
          )}

          <div className="section__grid">
            {fieldsForSection(section.key).map((field) => (
              <FieldInput
                key={field.path}
                id={field.path}
                label={field.label}
                inputType={field.inputType}
                hint={field.hint}
                wide={field.wide}
                value={getProfileValue(draft, field.path) ?? ''}
                error={errors[field.path]}
                onChange={(value) => onChange(setProfileValue(draft, field.path, value))}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <CustomFieldsEditor
        fields={draft.customFields}
        errors={errors}
        onChange={(customFields) => onChange({ ...draft, customFields })}
      />

      <div className="editor__actions">
        <button type="submit" className="button" disabled={busy || !isDirty}>
          Save profile
        </button>
        {isDirty && <span className="editor__unsaved">Unsaved changes</span>}
        <button type="button" className="button button--danger editor__delete" onClick={onDelete} disabled={busy}>
          Delete profile
        </button>
      </div>
    </form>
  );
}

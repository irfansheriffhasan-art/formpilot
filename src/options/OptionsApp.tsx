import { useEffect, useState } from 'react';
import { PassphraseSetup } from '../components/PassphraseSetup';
import { UnlockForm } from '../components/UnlockForm';
import { useProfiles } from '../hooks/useProfiles';
import { useVaultStatus } from '../hooks/useVaultStatus';
import {
  createProfile,
  deleteAllData,
  deleteProfile,
  ProfileValidationError,
  saveProfile,
  validateProfile,
  type ValidationErrors,
} from '../profiles/profileManager';
import type { UserProfile } from '../profiles/profileTypes';
import { CorrectionsPanel } from './components/CorrectionsPanel';
import { ProfileEditor } from './components/ProfileEditor';
import { ProfileList } from './components/ProfileList';
import { SecurityPanel } from './components/SecurityPanel';

/**
 * The options page. Every user first sets a passphrase; after that the page
 * shows the unlock screen until the vault is unlocked.
 */
export default function OptionsApp() {
  const status = useVaultStatus();

  async function handleForgot() {
    const ok =
      window.confirm('Without the passphrase your saved details can’t be decrypted. Delete ALL FormPilot data and start over?') &&
      window.confirm('This permanently deletes every profile. Continue?');
    if (ok) await deleteAllData();
  }

  if (status === 'unlocked') return <UnlockedOptions />;
  return (
    <div className="gate">
      <h1 className="brand">FormPilot</h1>
      {status === null ? null : status === 'setup-needed' ? <PassphraseSetup /> : <UnlockForm onForgot={handleForgot} />}
    </div>
  );
}

/**
 * Profile list on the left, editor on the right.
 *
 * Key idea: the editor works on a DRAFT, a private copy of the profile.
 * Typing changes only the draft. Storage changes only when the user
 * clicks Save. That's what makes "unsaved changes" and "discard" possible.
 */
function UnlockedOptions() {
  const { profiles, error: loadError } = useProfiles();
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Open the first profile automatically when nothing is selected.
  useEffect(() => {
    if (draft === null && profiles && profiles.length > 0) {
      loadDraft(profiles[0]);
    }
  }, [profiles, draft]);

  // Ask the browser to warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  function loadDraft(profile: UserProfile | null) {
    // structuredClone makes a deep copy, so editing the draft can never
    // accidentally modify the object inside the `profiles` list.
    setDraft(profile ? structuredClone(profile) : null);
    setIsDirty(false);
    setErrors({});
  }

  function confirmDiscard(): boolean {
    return !isDirty || window.confirm('You have unsaved changes. Discard them?');
  }

  function handleSelect(id: string) {
    if (id === draft?.id || !confirmDiscard()) return;
    setNotice(null);
    loadDraft(profiles?.find((p) => p.id === id) ?? null);
  }

  function handleChange(next: UserProfile) {
    setDraft(next);
    setIsDirty(true);
    setNotice(null);
  }

  async function handleCreate() {
    if (!confirmDiscard()) return;
    setBusy(true);
    try {
      loadDraft(await createProfile());
      setNotice('Profile created. Add your details, then save.');
    } catch {
      setNotice('Couldn’t create the profile. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!draft) return;

    // Validate first, without touching storage, so errors appear instantly.
    const found = validateProfile(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setNotice('Some fields need attention.');
      return;
    }

    setBusy(true);
    try {
      loadDraft(await saveProfile(draft));
      setNotice('Profile saved.');
    } catch (error) {
      if (error instanceof ProfileValidationError) {
        setErrors(error.errors);
        setNotice(error.message);
      } else {
        setNotice('Couldn’t save the profile. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!draft) return;
    const storedName = profiles?.find((p) => p.id === draft.id)?.profileName ?? draft.profileName;
    if (!window.confirm(`Delete the profile “${storedName}”? This can’t be undone.`)) return;

    setBusy(true);
    try {
      await deleteProfile(draft.id);
      loadDraft(null);
      setNotice('Profile deleted.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAll() {
    const ok = window.confirm(
      'Delete all FormPilot data, including every profile? This can’t be undone.',
    );
    if (!ok) return;

    setBusy(true);
    try {
      await deleteAllData();
      loadDraft(null);
      setNotice('All FormPilot data deleted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="options">
      <aside className="sidebar">
        <h1 className="brand">FormPilot</h1>
        <ProfileList
          profiles={profiles ?? []}
          selectedId={draft?.id ?? null}
          busy={busy}
          onSelect={handleSelect}
          onCreate={handleCreate}
        />
        <CorrectionsPanel />
        <SecurityPanel confirmLeave={confirmDiscard} />
        <section className="sidebar__data">
          <h2 className="sidebar__heading">Your data</h2>
          <p className="sidebar__note">
            Profiles and corrections are stored only in this browser. FormPilot never sends them anywhere.
          </p>
          <button className="button button--danger" onClick={handleDeleteAll} disabled={busy}>
            Delete all data
          </button>
        </section>
      </aside>

      <main className="workspace">
        {notice && <p className="notice" role="status">{notice}</p>}
        {loadError && <p className="notice notice--error" role="alert">{loadError}</p>}

        {profiles === null ? (
          <p className="muted">Loading profiles…</p>
        ) : draft ? (
          <ProfileEditor
            draft={draft}
            errors={errors}
            isDirty={isDirty}
            busy={busy}
            onChange={handleChange}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ) : (
          <div className="empty">
            <h2>Create your first profile</h2>
            <p className="muted">
              Enter your details once. FormPilot uses them to fill forms after you review each one.
            </p>
            <button className="button" onClick={handleCreate} disabled={busy}>New profile</button>
          </div>
        )}
      </main>
    </div>
  );
}

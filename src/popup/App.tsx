import { useEffect, useState } from 'react';
import { UnlockForm } from '../components/UnlockForm';
import { useProfiles } from '../hooks/useProfiles';
import { useVaultStatus } from '../hooks/useVaultStatus';
import { getActiveProfileId, setActiveProfileId } from '../profiles/profileManager';
import { lockVault } from '../storage/storage';
import { FormAssistant } from './components/FormAssistant';

// Opens the options page in a tab (declared as options_page in the manifest).
const openOptions = () => void chrome.runtime.openOptionsPage();

/**
 * Popup root. Nothing that reads profile data renders until the vault is
 * unlocked. First-time setup happens in the options page, because the popup
 * closes the moment it loses focus (and would lose a half-typed passphrase).
 */
export default function App() {
  const status = useVaultStatus();

  return (
    <main className="popup">
      <header className="popup__header">
        <div>
          <h1 className="popup__title">FormPilot</h1>
          <p className="popup__tagline">Understand any form. Fill it intelligently.</p>
        </div>
        {status === 'unlocked' && (
          <button className="button button--quiet" onClick={() => void lockVault()} title="Lock FormPilot now">
            Lock
          </button>
        )}
      </header>

      {status === null ? (
        <p className="note">Loading…</p>
      ) : status === 'setup-needed' ? (
        <section className="popup__panel">
          <p className="note">First, protect your details with a passphrase. Then create a profile.</p>
          <button className="button popup__primary" onClick={openOptions}>Set up FormPilot</button>
        </section>
      ) : status === 'locked' ? (
        <section className="popup__panel"><UnlockForm /></section>
      ) : (
        <UnlockedPopup />
      )}
    </main>
  );
}

/** Profile selection plus the form assistant. The popup never edits profiles itself. */
function UnlockedPopup() {
  const { profiles, error } = useProfiles();
  const [storedActiveId, setStoredActiveId] = useState<string | null>(null);

  useEffect(() => {
    getActiveProfileId().then((id) => setStoredActiveId(id ?? null));
  }, []);

  // Derived value: use the stored choice if that profile still exists,
  // otherwise fall back to the first profile. Computing this during render
  // (instead of storing it in state) means it can never go stale.
  const activeId =
    profiles?.some((p) => p.id === storedActiveId)
      ? storedActiveId
      : profiles?.[0]?.id ?? null;

  async function handleProfileChange(id: string) {
    setStoredActiveId(id);
    await setActiveProfileId(id);
  }

  return (
    <>
      <section className="popup__panel" aria-label="Profile">
        {error ? (
          <p className="error" role="alert">{error}</p>
        ) : profiles === null ? (
          <p className="note">Loading profiles…</p>
        ) : profiles.length === 0 ? (
          <>
            <p className="note">Create a profile with your details once, and FormPilot uses it to fill forms.</p>
            <button className="button popup__primary" onClick={openOptions}>Create profile</button>
          </>
        ) : (
          <>
            <label className="popup__label" htmlFor="profile-select">Use profile</label>
            <div className="popup__profile-row">
              <select
                id="profile-select"
                value={activeId ?? ''}
                onChange={(event) => handleProfileChange(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.profileName}</option>
                ))}
              </select>
              <button className="button button--quiet" onClick={openOptions}>Manage</button>
            </div>
          </>
        )}
      </section>

      <FormAssistant profile={profiles?.find((p) => p.id === activeId) ?? null} />
    </>
  );
}

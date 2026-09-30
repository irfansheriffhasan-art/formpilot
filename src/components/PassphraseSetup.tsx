import { useEffect, useState, type FormEvent } from 'react';
import { MIN_PASSPHRASE_LENGTH } from '../security/vault';
import { createVault, hasUnencryptedData } from '../storage/storage';

/**
 * First-run screen: every user protects their details with a passphrase
 * before creating a profile. Also migrates data from older versions.
 */
export function PassphraseSetup() {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasLegacy, setHasLegacy] = useState(false);

  useEffect(() => {
    hasUnencryptedData().then(setHasLegacy).catch(() => setHasLegacy(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (passphrase !== confirm) {
      setError('The two passphrases don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const problem = await createVault(passphrase);
      if (problem) setError(problem);
    } catch {
      setError('Couldn’t set up encryption. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="vault-form vault-form--wide" onSubmit={handleSubmit}>
      <h2 className="vault-form__title">Protect your details</h2>
      <p className="vault-form__note">
        FormPilot encrypts everything you save with a passphrase only you know. Someone who opens this
        browser or copies its files can’t read your details without it.
      </p>
      {hasLegacy && (
        <p className="vault-form__note">Your existing profiles will be encrypted, and the unencrypted copies deleted.</p>
      )}

      <label className="vault-form__label" htmlFor="new-passphrase">Passphrase</label>
      <input
        id="new-passphrase"
        type="password"
        autoComplete="new-password"
        autoFocus
        minLength={MIN_PASSPHRASE_LENGTH}
        value={passphrase}
        onChange={(event) => setPassphrase(event.target.value)}
      />
      <p className="vault-form__hint">
        At least {MIN_PASSPHRASE_LENGTH} characters. Four random words (“lamp orbit cedar mango”) is strong and easy to remember.
      </p>

      <label className="vault-form__label" htmlFor="confirm-passphrase">Type it again</label>
      <input
        id="confirm-passphrase"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />

      <label className="vault-form__check">
        <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
        I understand that if I forget this passphrase, my saved details can’t be recovered.
      </label>

      {error && <p className="vault-form__error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || !understood || !passphrase || !confirm}>
        {busy ? 'Encrypting…' : 'Set passphrase'}
      </button>
    </form>
  );
}

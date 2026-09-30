import { useState, type FormEvent } from 'react';
import { unlockVault } from '../storage/storage';

interface UnlockFormProps {
  /** Shown under the form in the options page ("Forgot your passphrase?"). */
  onForgot?: () => void;
}

/** Asks for the passphrase. Used by both the popup and the options page. */
export function UnlockForm({ onForgot }: UnlockFormProps) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Deliberately slow (~0.5 s): the same cost that slows down guessing.
      const ok = await unlockVault(passphrase);
      if (!ok) setError('That passphrase isn’t right.');
    } catch {
      setError('Couldn’t unlock. Try again.');
    } finally {
      setPassphrase('');
      setBusy(false);
    }
  }

  return (
    <form className="vault-form" onSubmit={handleSubmit}>
      <h2 className="vault-form__title">FormPilot is locked</h2>
      <p className="vault-form__note">Your details are encrypted. Enter your passphrase to use them.</p>
      <label className="vault-form__label" htmlFor="unlock-passphrase">Passphrase</label>
      <input
        id="unlock-passphrase"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={passphrase}
        onChange={(event) => setPassphrase(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'unlock-error' : undefined}
      />
      {error && <p id="unlock-error" className="vault-form__error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || passphrase.length === 0}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
      {onForgot && (
        <button type="button" className="button button--danger vault-form__forgot" onClick={onForgot}>
          Forgot your passphrase?
        </button>
      )}
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { AUTO_LOCK_MS, changePassphrase, lockVault } from '../../storage/storage';

/** Sidebar controls: lock now, and change the passphrase. */
export function SecurityPanel({ confirmLeave }: { confirmLeave: () => boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const problem = await changePassphrase(current, next);
      setMessage(problem ? { text: problem, ok: false } : { text: 'Passphrase changed.', ok: true });
      if (!problem) {
        setCurrent('');
        setNext('');
      }
    } catch {
      setMessage({ text: 'Couldn’t change the passphrase. Try again.', ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="sidebar__heading">Security</h2>
      <p className="sidebar__note">
        Your details are encrypted. FormPilot locks itself after {AUTO_LOCK_MS / 60_000} minutes without use and when the browser closes.
      </p>
      <button className="button button--quiet" onClick={() => confirmLeave() && void lockVault()}>Lock now</button>

      <details className="security__change">
        <summary>Change passphrase</summary>
        <form onSubmit={handleChange} className="security__form">
          <label htmlFor="current-passphrase">Current passphrase</label>
          <input id="current-passphrase" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <label htmlFor="next-passphrase">New passphrase</label>
          <input id="next-passphrase" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          {message && <p className={message.ok ? 'security__ok' : 'security__error'} role="status">{message.text}</p>}
          <button className="button button--quiet" type="submit" disabled={busy || !current || !next}>
            {busy ? 'Re-encrypting…' : 'Change'}
          </button>
        </form>
      </details>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { getVaultStatus, onVaultStatusChanged, type VaultStatus } from '../storage/storage';

/**
 * Whether FormPilot needs setup, is locked, or is unlocked. Updates live:
 * lock in the options page and an open popup locks too.
 * null while loading.
 */
export function useVaultStatus(): VaultStatus | null {
  const [status, setStatus] = useState<VaultStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getVaultStatus()
        .then((next) => { if (!cancelled) setStatus(next); })
        .catch(() => { if (!cancelled) setStatus('locked'); });
    };
    load();
    const unsubscribe = onVaultStatusChanged(load);
    // Auto-lock is checked lazily (on use), so re-check now and then too.
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  return status;
}

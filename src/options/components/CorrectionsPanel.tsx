import { useEffect, useState } from 'react';
import { clearCorrections, deleteCorrectionsForHost, listCorrections } from '../../corrections/correctionStore';
import { onItemChanged, type CorrectionEntry } from '../../storage/storage';

/**
 * Shows what FormPilot has learned from the user's corrections, per site,
 * and lets them forget it. Only site names and field labels are stored.
 */
export function CorrectionsPanel() {
  const [entries, setEntries] = useState<CorrectionEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listCorrections()
        .then((list) => { if (!cancelled) setEntries(list); })
        .catch(() => { /* the panel just stays empty */ });
    };
    load();
    const unsubscribe = onItemChanged('corrections', load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Count corrections per site.
  const perHost = new Map<string, number>();
  for (const entry of entries) perHost.set(entry.hostname, (perHost.get(entry.hostname) ?? 0) + 1);

  return (
    <section>
      <h2 className="sidebar__heading">Learned corrections</h2>
      {perHost.size === 0 ? (
        <p className="sidebar__note">
          When you change what a field is filled with, FormPilot remembers it for that site.
        </p>
      ) : (
        <>
          <ul className="learned">
            {[...perHost].map(([hostname, count]) => (
              <li key={hostname}>
                <span className="learned__host" title={hostname}>{hostname}</span>
                <span className="learned__count">{count}</span>
                <button
                  className="learned__remove"
                  onClick={() => deleteCorrectionsForHost(hostname)}
                  aria-label={`Forget corrections for ${hostname}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button className="button button--quiet" onClick={() => clearCorrections()}>Forget all</button>
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { listProfiles } from '../profiles/profileManager';
import type { UserProfile } from '../profiles/profileTypes';
import { onItemChanged, VaultLockedError } from '../storage/storage';

/**
 * Loads the profile list and keeps it up to date.
 *
 * `profiles` is null while loading, then an array (possibly empty).
 * Distinguishing "loading" from "no profiles" lets the UI show the right
 * message instead of briefly flashing "You have no profiles".
 */
export function useProfiles(): { profiles: UserProfile[] | null; error: string | null } {
  const [profiles, setProfiles] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If the component unmounts while a load is in flight, ignore the result.
    // Setting state on an unmounted component is a common React bug.
    let cancelled = false;

    function load() {
      listProfiles()
        .then((list) => {
          if (cancelled) return;
          setProfiles(list);
          setError(null);
        })
        .catch((error) => {
          if (cancelled) return;
          // Locked isn't an error: the page shows its unlock screen instead.
          if (error instanceof VaultLockedError) setProfiles(null);
          else setError('Couldn’t load your profiles. Reload this page to try again.');
        });
    }

    load();
    // Reload whenever any part of the extension changes the stored profiles.
    const unsubscribe = onItemChanged('profiles', load);

    // Cleanup runs when the component unmounts.
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { profiles, error };
}

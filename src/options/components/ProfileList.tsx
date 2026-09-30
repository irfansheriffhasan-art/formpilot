import type { UserProfile } from '../../profiles/profileTypes';

interface ProfileListProps {
  profiles: UserProfile[];
  selectedId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

/** Sidebar list of profiles. Purely presentational: it holds no state. */
export function ProfileList({ profiles, selectedId, busy, onSelect, onCreate }: ProfileListProps) {
  return (
    <nav className="profile-list" aria-label="Profiles">
      <h2 className="sidebar__heading">Profiles</h2>

      {profiles.length === 0 ? (
        <p className="sidebar__note">No profiles yet.</p>
      ) : (
        <ul>
          {profiles.map((profile) => {
            const selected = profile.id === selectedId;
            return (
              <li key={profile.id}>
                <button
                  className={`profile-list__item${selected ? ' is-selected' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(profile.id)}
                >
                  {profile.profileName}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button className="button button--quiet" onClick={onCreate} disabled={busy}>
        New profile
      </button>
    </nav>
  );
}

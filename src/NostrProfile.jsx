import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import NostrEventCard from "./NostrEventCard";
import { getFollows, isFollowing, toggleFollow } from "./follows";

/**
 * NostrProfile — a React component that looks up a Nostr user's profile
 * metadata (kind 0) and their published text note events (kind 1).
 *
 * Reads the pubkey from the URL path `/profile/:pubkey`,
 * or lets the user enter one manually via a search input.
 */
export default function NostrProfile({ ndk }) {
  const { pubkey: urlPubkey } = useParams();
  const [inputValue, setInputValue] = useState(urlPubkey || "");
  const [pubkey, setPubkey] = useState(null);
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isFollowed, setIsFollowed] = useState(false);

  const [sortOrder, setSortOrder] = useState("newest");

  // Check follow status whenever the looked-up pubkey changes
  useEffect(() => {
    setIsFollowed(isFollowing(pubkey));
  }, [pubkey]);

  // Subscribe to the follows observable (reacts to same-tab changes)
  useEffect(() => {
    function handleFollowChange() {
      setIsFollowed(isFollowing(pubkey));
    }
    const unsubscribe = getFollows.subscribe(handleFollowChange);
    // Also listen for changes from other tabs (localStorage sync)
    window.addEventListener("storage", handleFollowChange);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleFollowChange);
    };
  }, [pubkey]);

  // Auto-lookup if a pubkey is in the URL
  useEffect(() => {
    if (urlPubkey) {
      setInputValue(urlPubkey);
      doLookup(urlPubkey);
    } else {
      setInputValue("");
      setPubkey(null);
      setProfile(null);
      setEvents([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPubkey]);

  /**
   * Resolve the input to a hex pubkey.
   */
  async function resolvePubkey(input) {
    const trimmed = input.trim();
    // Already a hex pubkey (64 hex chars)
    if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed;

    // Try npub decoding via NDK's nip19
    if (trimmed.startsWith("npub1")) {
      try {
        const { nip19 } = await import("@nostr-dev-kit/ndk");
        const decoded = nip19.decode(trimmed);
        if (decoded.type === "npub") return decoded.data;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Perform the lookup: fetch profile metadata + user events.
   */
  async function doLookup(input) {
    if (!input) return;

    setLoading(true);
    setError(null);
    setProfile(null);
    setEvents([]);

    try {
      const resolved = await resolvePubkey(input);
      if (!resolved) {
        setError(
          "Invalid pubkey. Enter a hex pubkey (64 hex chars) or an npub address.",
        );
        setLoading(false);
        return;
      }

      setPubkey(resolved);

      // Fetch profile metadata (kind 0)
      const user = ndk.getUser({ pubkey: resolved });
      await user.fetchProfile();
      setProfile(user.profile || {});

      // Fetch user events (kind 1 text notes)
      await fetchUserEvents(resolved);
    } catch (err) {
      setError(`Error fetching profile: ${err.message}`);
    }

    setLoading(false);
  }

  /**
   * Fetch events published by the user.
   */
  async function fetchUserEvents(pubkeyHex) {
    if (!pubkeyHex) return;

    setEventsLoading(true);

    try {
      const fetchedEvents = await ndk.fetchEvents({
        authors: [pubkeyHex],
        kinds: [1],
        limit: 50,
      });

      const sorted = [...fetchedEvents].sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0),
      );
      setEvents(sorted);
    } catch (err) {
      console.error("Error fetching user events:", err);
    }

    setEventsLoading(false);
  }

  /**
   * Handle the search form submission.
   */
  function handleSubmit(e) {
    e.preventDefault();
    doLookup(inputValue);
  }

  /**
   * Toggle this account's follow status using the follows module.
   */
  function handleToggleFollow() {
    const accountData = {
      pubkey,
      name: profile?.name,
      displayName: profile?.displayName,
      picture: profile?.picture,
      nip05: profile?.nip05,
    };
    setIsFollowed(toggleFollow(accountData));
  }

  /**
   * Get sorted events based on current sort order.
   */
  const sortedEvents = useCallback(() => {
    return [...events].sort((a, b) => {
      if (sortOrder === "newest") {
        return (b.created_at || 0) - (a.created_at || 0);
      }
      return (a.created_at || 0) - (b.created_at || 0);
    });
  }, [events, sortOrder]);

  /**
   * Format a pubkey for display (truncated).
   */
  function formatPubkey(hex) {
    if (!hex) return "";
    return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
  }

  return (
    <div className="nostr-profile">
      <h2 className="nostr-profile__title">Profile</h2>

      {/* Search input */}
      <form className="nostr-profile__search" onSubmit={handleSubmit}>
        <input
          className="nostr-profile__input"
          type="text"
          placeholder="Enter npub or hex pubkey…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button
          className="nostr-profile__search-btn"
          type="submit"
          disabled={loading || !inputValue.trim()}
        >
          {loading ? "Looking up…" : "Lookup"}
        </button>
      </form>

      {/* Error */}
      {error && <div className="nostr-profile__error">⚠️ {error}</div>}

      {/* Profile card */}
      {profile && pubkey && (
        <div className="nostr-profile__card">
          {/* Banner */}
          {profile.banner && (
            <div
              className="nostr-profile__banner"
              style={{ backgroundImage: `url(${profile.banner})` }}
            />
          )}

          <div className="nostr-profile__card-body">
            {/* Avatar & basic info */}
            <div className="nostr-profile__card-top">
              {profile.picture ? (
                <img
                  className="nostr-profile__avatar"
                  src={profile.picture}
                  alt=""
                />
              ) : (
                <div className="nostr-profile__avatar-placeholder">
                  {(profile.displayName || profile.name || "?")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}

              <div className="nostr-profile__info">
                <h3 className="nostr-profile__display-name">
                  {profile.displayName || profile.name || "Anonymous"}
                </h3>
                {profile.name && profile.name !== profile.displayName && (
                  <span className="nostr-profile__name">@{profile.name}</span>
                )}
                <div className="nostr-profile__pubkey">
                  <code>{formatPubkey(pubkey)}</code>
                </div>
              </div>

              <div className="nostr-profile__follow">
                <button
                  className={`nostr-profile__follow-btn ${isFollowed ? "nostr-profile__follow-btn--active" : ""}`}
                  onClick={handleToggleFollow}
                  aria-pressed={isFollowed}
                  title={
                    isFollowed ? "Unfollow this account" : "Follow this account"
                  }
                >
                  {isFollowed ? "Following" : "Follow"}
                </button>
              </div>
            </div>

            {/* About */}
            {profile.about && (
              <p className="nostr-profile__about">{profile.about}</p>
            )}

            {/* Extra metadata */}
            <div className="nostr-profile__meta">
              {profile.nip05 && (
                <div className="nostr-profile__meta-item">
                  <span className="nostr-profile__meta-label">NIP-05</span>
                  <span className="nostr-profile__meta-value">
                    {profile.nip05}
                  </span>
                </div>
              )}
              {profile.website && (
                <div className="nostr-profile__meta-item">
                  <span className="nostr-profile__meta-label">Website</span>
                  <a
                    className="nostr-profile__meta-value nostr-profile__link"
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {profile.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
              {profile.lud06 && (
                <div className="nostr-profile__meta-item">
                  <span className="nostr-profile__meta-label">Lightning</span>
                  <span className="nostr-profile__meta-value">
                    {profile.lud06}
                  </span>
                </div>
              )}
              {profile.lud16 && (
                <div className="nostr-profile__meta-item">
                  <span className="nostr-profile__meta-label">Zap Address</span>
                  <span className="nostr-profile__meta-value">
                    {profile.lud16}
                  </span>
                </div>
              )}
            </div>

            {/* Full pubkey (click to copy) */}
            <div className="nostr-profile__pubkey-full">
              <span className="nostr-profile__meta-label">Pubkey</span>
              <code
                className="nostr-profile__pubkey-copy"
                onClick={() => navigator.clipboard?.writeText(pubkey)}
                title="Click to copy"
              >
                {pubkey}
              </code>
            </div>
          </div>
        </div>
      )}

      {/* User's events */}
      {pubkey && (
        <div className="nostr-profile__events">
          <div className="nostr-profile__events-header">
            <h3 className="nostr-profile__events-title">
              Events
              {events.length > 0 && (
                <span className="nostr-profile__events-count">
                  ({events.length})
                </span>
              )}
            </h3>

            {events.length > 1 && (
              <select
                className="nostr-profile__sort-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            )}
          </div>

          {eventsLoading && (
            <div className="nostr-profile__events-loading">Loading events…</div>
          )}

          {!eventsLoading && events.length === 0 && !loading && (
            <div className="nostr-profile__events-empty">
              {profile
                ? "This user hasn't published any text notes yet."
                : "Look up a profile to see their events."}
            </div>
          )}

          {!eventsLoading && events.length > 0 && (
            <div className="nostr-profile__events-list">
              {sortedEvents().map((event) => (
                <NostrEventCard
                  key={event.id}
                  event={event}
                  showMeta={true}
                  ndk={ndk}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Initial placeholder */}
      {!pubkey && !loading && !error && (
        <div className="nostr-profile__placeholder">
          <p>
            Enter a Nostr pubkey (hex or npub) to look up a user's profile and
            see their published events.
          </p>
        </div>
      )}

      {/* Footer */}
      {pubkey && (
        <div className="nostr-profile__footer">
          <span className="nostr-profile__footer-item">
            {events.length} event{events.length !== 1 ? "s" : ""} found
          </span>
        </div>
      )}
    </div>
  );
}

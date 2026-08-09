import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getFollows } from "./follows";
import { truncateHex } from "./utils";

/**
 * FollowingAvatar — the account's profile picture, falling back to an
 * initial placeholder when no picture is available or it fails to load.
 */
function FollowingAvatar({ account }) {
  const [imgFailed, setImgFailed] = useState(false);
  const displayName =
    account.displayName || account.name || truncateHex(account.pubkey);

  if (account.picture && !imgFailed) {
    return (
      <img
        className="nostr-following__avatar"
        src={account.picture}
        alt=""
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className="nostr-following__avatar nostr-following__avatar-placeholder">
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * NostrFollowing — displays all followed accounts from localStorage.
 *
 * Each followed account is shown as a grid tile with their profile picture
 * and name; clicking a tile opens that account's profile page.
 */
export default function NostrFollowing() {
  const navigate = useNavigate();
  const [follows, setFollows] = useState([]);

  useEffect(() => {
    function loadFollows() {
      setFollows(getFollows());
    }

    // Load immediately
    loadFollows();

    // Subscribe to the observable (react to changes within the same tab)
    const unsubscribe = getFollows.subscribe(loadFollows);

    // Also listen for changes from other tabs (localStorage sync)
    window.addEventListener("storage", loadFollows);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", loadFollows);
    };
  }, []);

  return (
    <div className="nostr-following">
      <div className="nostr-following__header">
        <h2 className="nostr-following__title">Following</h2>
        {follows.length > 0 && (
          <span className="nostr-following__count">
            {follows.length} account{follows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {follows.length === 0 ? (
        <div className="nostr-following__empty">
          <p>You're not following any accounts yet.</p>
          <p className="nostr-following__hint">
            Look up a profile and click <strong>Follow</strong> to add it here.
          </p>
        </div>
      ) : (
        <div className="nostr-following__grid">
          {follows.map((account) => {
            const displayName =
              account.displayName || account.name || truncateHex(account.pubkey);
            return (
              <button
                key={account.pubkey}
                className="nostr-following__card"
                onClick={() => navigate(`/profile/${account.pubkey}`)}
                title={`View ${displayName}'s profile`}
              >
                <FollowingAvatar account={account} />
                <span className="nostr-following__name">{displayName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

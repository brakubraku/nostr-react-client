import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
 * AccountCard — a clickable tile for a followed Nostr account.
 *
 * Props:
 *   account - An object with pubkey, displayName, name, and optional picture.
 */
export default function AccountCard({ account }) {
  const navigate = useNavigate();
  const displayName =
    account.displayName || account.name || truncateHex(account.pubkey);

  return (
    <button
      className="nostr-following__card"
      onClick={() => navigate(`/profile/${account.pubkey}`)}
      title={`View ${displayName}'s profile`}
    >
      <FollowingAvatar account={account} />
      <span className="nostr-following__name">{displayName}</span>
    </button>
  );
}

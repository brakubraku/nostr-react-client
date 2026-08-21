import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { truncateHex } from "./utils";

const HEX_PUBKEY_RE = /^[0-9a-f]{64}$/i;

/**
 * FollowingAvatar — the account's profile picture, falling back to an
 * initial placeholder when no picture is available or it fails to load.
 */
function FollowingAvatar({ profile, pubkey }) {
  const [imgFailed, setImgFailed] = useState(false);
  const displayName =
    profile?.displayName || profile?.name || truncateHex(pubkey);

  if (profile?.picture && !imgFailed) {
    return (
      <img
        className="nostr-following__avatar"
        src={profile.picture}
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
 * AccountCard — a clickable tile for a Nostr account.
 *
 * Props:
 *   pubkey - The account's hex pubkey (an npub address is decoded first).
 *   ndk    - Shared NDK instance used to load the account's profile.
 */
export default function AccountCard({ pubkey, ndk }) {
  const navigate = useNavigate();
  const [hexPubkey, setHexPubkey] = useState(null);
  const [profile, setProfile] = useState(null);

  // Resolve the pubkey: hex stays as-is, npub is decoded via NIP-19.
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const value = String(pubkey ?? "").trim();
      let resolved = null;
      if (HEX_PUBKEY_RE.test(value)) {
        resolved = value.toLowerCase();
      } else if (value.startsWith("npub1")) {
        try {
          const { nip19 } = await import("@nostr-dev-kit/ndk");
          const decoded = nip19.decode(value);
          if (decoded.type === "npub") resolved = decoded.data;
        } catch {
          // Not a valid npub address; show the raw value instead.
        }
      }
      if (!cancelled) {
        setHexPubkey(resolved || value);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  // Load the account's profile metadata.
  useEffect(() => {
    if (!hexPubkey || !ndk) return;
    let cancelled = false;

    async function loadProfile() {
      try {
        const user = ndk.getUser({ pubkey: hexPubkey });
        await user.fetchProfile();
        if (!cancelled) {
          setProfile(user.profile || {});
        }
      } catch {
        if (!cancelled) {
          setProfile({});
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [hexPubkey, ndk]);

  const displayPubkey = hexPubkey || String(pubkey ?? "").trim();
  const displayName =
    profile?.displayName || profile?.name || truncateHex(displayPubkey);

  return (
    <button
      className="nostr-following__card"
      onClick={() => navigate(`/profile/${displayPubkey}`)}
      title={`View ${displayName}'s profile`}
    >
      <FollowingAvatar profile={profile} pubkey={displayPubkey} />
      <span className="nostr-following__name">{displayName}</span>
    </button>
  );
}

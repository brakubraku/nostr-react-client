import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getNDK } from "./ndk";
/**
 * Format a Unix timestamp (in seconds) to a human-readable relative time string.
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Truncate a long hex string (like a pubkey or event id) for display.
 */
function truncateHex(hex, chars = 8) {
  if (!hex || hex.length <= chars * 2 + 3) return hex;
  return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}

/**
 * Get the kind label for common Nostr event kinds.
 */
function getKindLabel(kind) {
  const labels = {
    0: "Metadata",
    1: "Text Note",
    3: "Contact List",
    4: "Encrypted DM",
    5: "Deletion",
    6: "Repost",
    7: "Reaction",
    8: "Badge Award",
    40: "Channel Creation",
    41: "Channel Metadata",
    42: "Channel Message",
    43: "Channel Hide",
    44: "Channel Mute",
    1063: "File Metadata",
    1984: "Reporting",
    9734: "Zap Request",
    9735: "Zap Receipt",
    10002: "Relay List Metadata",
    30023: "Long-form Content",
  };
  return labels[kind] || `Kind ${kind}`;
}

/**
 * Get saved favorites from localStorage.
 */
function getFavorites() {
  try {
    const stored = localStorage.getItem("nostr-favorites");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * NostrEventCard — a React component that displays a single Nostr event.
 *
 * Props:
 *   event          - An NDKEvent object (or plain object with id, kind, pubkey, content, created_at, tags)
 *   showMeta       - Whether to show pubkey, id, kind metadata (default: true)
 *   confirmUnfav   - Whether to show a confirmation modal before unfavouriting (default: false)
 */
export default function NostrEventCard({ event, showMeta = true }) {
  const navigate = useNavigate();
  const [authorMeta, setAuthorMeta] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const ndk = getNDK();

  // Check if this event is already in favorites on mount
  useEffect(() => {
    const favorites = getFavorites();
    setIsFavorite(favorites.some((fav) => fav.id === event?.id));
  }, [event?.id]);

  // Fetch author metadata (kind 0) if we have an NDK instance
  useEffect(() => {
    if (!ndk || !event?.pubkey) return;

    let cancelled = false;

    async function fetchAuthor() {
      try {
        const user = ndk.getUser({ pubkey: event.pubkey });
        await user.fetchProfile();
        if (!cancelled) {
          setAuthorMeta(user.profile);
        }
      } catch (error) {
        console.error(error);
      }
    }

    fetchAuthor();
    return () => {
      cancelled = true;
    };
  }, [ndk, event?.pubkey]);

  /**
   * Toggle this event's favorite status in localStorage.
   */
  function toggleFavorite(e) {
    e.stopPropagation(); // Prevent card expansion when clicking the button

    // Show confirmation modal when unfavouriting inside NostrFavourites
    if (isFavorite && confirmUnfav) {
      setShowConfirmModal(true);
      return;
    }

    const favorites = getFavorites();
    const eventData = {
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
      content: event.content,
      created_at: event.created_at,
      tags: event.tags,
    };

    if (isFavorite) {
      // Remove from favorites
      const updated = favorites.filter((fav) => fav.id !== event.id);
      localStorage.setItem("nostr-favorites", JSON.stringify(updated));
      setIsFavorite(false);
    } else {
      // Add to favorites
      const updated = [eventData, ...favorites];
      localStorage.setItem("nostr-favorites", JSON.stringify(updated));
      setIsFavorite(true);
    }

    // Dispatch custom event so other components (e.g. NostrFavourites) can refresh
    window.dispatchEvent(new Event("nostr-favorites-changed"));
  }

  function removeFromFavorites() {
    const favorites = getFavorites();
    const updated = favorites.filter((fav) => fav.id !== event.id);
    localStorage.setItem("nostr-favorites", JSON.stringify(updated));
    setIsFavorite(false);
    window.dispatchEvent(new Event("nostr-favorites-changed"));
  }

  function confirmRemove(e) {
    e.stopPropagation();
    removeFromFavorites();
    setShowConfirmModal(false);
  }

  function cancelConfirm(e) {
    e.stopPropagation();
    setShowConfirmModal(false);
  }

  if (!event) {
    return <div className="nostr-card nostr-card--empty">No event data</div>;
  }

  const { id, kind, pubkey, content, created_at, tags } = event;

  // Determine content display
  const contentPreview =
    content && content.length > 280 ? content.slice(0, 280) + "…" : content;

  // Extract some tag info
  const eTags = (tags || []).filter((t) => t[0] === "e");
  const pTags = (tags || []).filter((t) => t[0] === "p");

  return (
    <div className="nostr-card" onClick={() => setExpanded(!expanded)}>
      <div className="nostr-card__header">
        {/* Author avatar + name */}
        <div
          className="nostr-card__author"
          onClick={(e) => {
            e.stopPropagation();

            if (pubkey) {
              navigate(`/profile/${pubkey}`);
            }
          }}
          title="View profile"
        >
          {authorMeta?.picture ? (
            <img
              className="nostr-card__avatar"
              src={authorMeta.picture}
              alt=""
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ) : (
            <div className="nostr-card__avatar-placeholder">
              {(authorMeta?.name || pubkey || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="nostr-card__author-info">
            <span className="nostr-card__author-name">
              {authorMeta?.displayName ||
                authorMeta?.name ||
                truncateHex(pubkey)}
            </span>
            {created_at && (
              <span className="nostr-card__time">
                {formatRelativeTime(created_at)}
              </span>
            )}
          </div>
        </div>

        <div className="nostr-card__header-right">
          {showMeta && (
            <span className="nostr-card__kind-badge">{getKindLabel(kind)}</span>
          )}
          <button
            className={`nostr-card__fav-btn ${isFavorite ? "nostr-card__fav-btn--active" : ""}`}
            onClick={toggleFavorite}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={isFavorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {isFavorite ? (
                <line x1="5" y1="12" x2="19" y2="12" />
              ) : (
                <>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Event content */}
      <div className="nostr-card__content">
        {kind === 1 || kind === 30023 || !kind ? (
          <p>{expanded ? content : contentPreview}</p>
        ) : kind === 7 ? (
          <p className="nostr-card__reaction">{content || "❤️"}</p>
        ) : (
          <p>{expanded ? content : contentPreview}</p>
        )}
      </div>

      {/* Event metadata (collapsible) */}
      {showMeta && expanded && (
        <div className="nostr-card__meta">
          <div className="nostr-card__meta-row">
            <span className="nostr-card__meta-label">Event ID</span>
            <code className="nostr-card__meta-value">{id}</code>
          </div>
          <div className="nostr-card__meta-row">
            <span className="nostr-card__meta-label">Pubkey</span>
            <code className="nostr-card__meta-value">{pubkey}</code>
          </div>
          {eTags.length > 0 && (
            <div className="nostr-card__meta-row">
              <span className="nostr-card__meta-label">Replies to</span>
              <code className="nostr-card__meta-value">
                {eTags.map((t) => truncateHex(t[1])).join(", ")}
              </code>
            </div>
          )}
          {pTags.length > 0 && (
            <div className="nostr-card__meta-row">
              <span className="nostr-card__meta-label">Mentions</span>
              <code className="nostr-card__meta-value">
                {pTags.map((t) => truncateHex(t[1])).join(", ")}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="nostr-card__footer">
        {showMeta && (
          <span className="nostr-card__footer-item">Kind: {kind ?? "?"}</span>
        )}
        {eTags.length > 0 && (
          <span className="nostr-card__footer-item">
            {eTags.length} repl{eTags.length !== 1 ? "ies" : "y"}
          </span>
        )}
        {pTags.length > 0 && (
          <span className="nostr-card__footer-item">
            {pTags.length} mention{pTags.length !== 1 ? "s" : ""}
          </span>
        )}
        <span className="nostr-card__footer-item nostr-card__click-hint">
          {expanded ? "▲ less" : "▼ more"}
        </span>
      </div>

      {showConfirmModal && (
        <div className="nostr-card__modal-overlay" onClick={cancelConfirm}>
          <div
            className="nostr-card__modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="nostr-card__modal-title">Remove from favourites?</h3>
            <p className="nostr-card__modal-text">
              Are you sure you want to remove this event from your favourites?
            </p>
            <div className="nostr-card__modal-actions">
              <button
                className="nostr-card__modal-btn nostr-card__modal-btn--cancel"
                onClick={cancelConfirm}
              >
                Cancel
              </button>
              <button
                className="nostr-card__modal-btn nostr-card__modal-btn--confirm"
                onClick={confirmRemove}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

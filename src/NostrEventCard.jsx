import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getNDK } from "./ndk";
import {
  getFavorites,
  isFavorite,
  toggleFavorite as toggleFav,
  removeFavorite,
} from "./favorites";
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
 * Extract image URLs from text content.
 * Finds http/https URLs ending in common image extensions.
 */
function extractImageUrls(content) {
  if (!content) return [];
  const imageRegex =
    /https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s]*)?/gi;
  const matches = content.match(imageRegex);
  return matches ? [...new Set(matches)] : [];
}

/**

 * Extract video URLs from text content.
 * Supports direct video files (.mp4, .webm, .ogg) and YouTube/Vimeo links.
 */

function extractVideoUrls(content) {
  if (!content) return [];
  const videoRegex =
    /(?:https?:\/\/[^\s]+?\.(?:mp4|webm|ogg)(?:\?[^\s]*)?|https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[^\s]+)/gi;
  const matches = content.match(videoRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Strip image and video URLs from content for display.
 */
function stripMediaUrls(content) {
  if (!content) return "";

  // Remove image URLs
  let result = content.replace(
    /https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s]*)?\s*/gi,
    "",
  );
  // Remove video URLs
  result = result.replace(
    /(?:https?:\/\/[^\s]+?\.(?:mp4|webm|ogg)(?:\?[^\s]*)?|https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[^\s]*)\s*/gi,
    "",
  );
  return result.trim();
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
 * NostrEventCard — a React component that displays a single Nostr event.
 *
 * Props:
 *   event          - An NDKEvent object (or plain object with id, kind, pubkey, content, created_at, tags)
 *   showMeta       - Whether to show pubkey, id, kind metadata (default: true)
 *   confirmUnfav   - Whether to show a confirmation modal before unfavouriting (default: false)
 */
export default function NostrEventCard({
  event,
  showMeta = true,
  confirmUnfav,
}) {
  const navigate = useNavigate();
  const [authorMeta, setAuthorMeta] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showAllVideos, setShowAllVideos] = useState(false);
  const ndk = getNDK();

  // Check if this event is already in favorites on mount and when external changes happen
  useEffect(() => {
    setIsFav(isFavorite(event?.id));
  }, [event?.id]);

  // Subscribe to the favorites observable (reacts to same-tab changes)
  useEffect(() => {
    function handleFavChange() {
      setIsFav(isFavorite(event?.id));
    }
    const unsubscribe = getFavorites.subscribe(handleFavChange);
    // Also listen for changes from other tabs (localStorage sync)
    window.addEventListener("storage", handleFavChange);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleFavChange);
    };
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
   * Toggle this event's favorite status using the favorites module.
   */
  function toggleFavorite(e) {
    e.stopPropagation(); // Prevent card expansion when clicking the button

    // Show confirmation modal when unfavouriting inside NostrFavourites
    if (isFav && confirmUnfav) {
      setShowConfirmModal(true);
      return;
    }

    const eventData = {
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
      content: event.content,
      created_at: event.created_at,
      tags: event.tags,
    };

    const nowFav = toggleFav(eventData);
    setIsFav(nowFav);
  }

  function removeFromFavorites() {
    removeFavorite(event.id);
    setIsFav(false);
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
  const cleanContent = stripMediaUrls(content || "");
  const contentPreview =
    cleanContent && cleanContent.length > 280
      ? cleanContent.slice(0, 280) + "…"
      : cleanContent;

  // Extract some tag info
  const eTags = (tags || []).filter((t) => t[0] === "e");
  const pTags = (tags || []).filter((t) => t[0] === "p");

  // Image handling
  const imageUrls = extractImageUrls(content);
  const [randomImage] = useState(() => {
    if (imageUrls.length > 1) {
      return imageUrls[Math.floor(Math.random() * imageUrls.length)];
    }
    return imageUrls[0] || null;
  });

  // Video handling
  const videoUrls = extractVideoUrls(content);
  const [randomVideo] = useState(() => {
    if (videoUrls.length > 1) {
      return videoUrls[Math.floor(Math.random() * videoUrls.length)];
    }
    return videoUrls[0] || null;
  });

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
            className={`nostr-card__fav-btn ${isFav ? "nostr-card__fav-btn--active" : ""}`}
            onClick={toggleFavorite}
            title={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={isFav ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {isFav ? (
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
          <p>{expanded ? cleanContent : contentPreview}</p>
        ) : kind === 7 ? (
          <p className="nostr-card__reaction">{content || "❤️"}</p>
        ) : (
          <p>{expanded ? cleanContent : contentPreview}</p>
        )}
      </div>

      {/* Images extracted from content */}

      {imageUrls.length > 0 && (
        <div className="nostr-card__images">
          {showAllImages || imageUrls.length === 1 ? (
            imageUrls.map((url, i) => (
              <img
                key={i}
                className="nostr-card__image"
                src={url}
                alt={`Image ${i + 1}`}
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            ))
          ) : (
            <>
              <img
                className="nostr-card__image"
                src={randomImage}
                alt="Image"
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(randomImage, "_blank", "noopener,noreferrer");
                }}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
              <button
                className="nostr-card__show-all-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllImages(true);
                }}
              >
                Show all {imageUrls.length} images
              </button>
            </>
          )}
        </div>
      )}

      {/* Videos extracted from content */}
      {videoUrls.length > 0 && (
        <div className="nostr-card__videos">
          {showAllVideos || videoUrls.length === 1 ? (
            videoUrls.map((url, i) => (
              <video
                key={i}
                className="nostr-card__video"
                src={url}
                controls
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
              >
                Your browser does not support the video tag.
              </video>
            ))
          ) : (
            <>
              <video
                className="nostr-card__video"
                src={randomVideo}
                controls
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
              >
                Your browser does not support the video tag.
              </video>
              <button
                className="nostr-card__show-all-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllVideos(true);
                }}
              >
                Show all {videoUrls.length} videos
              </button>
            </>
          )}
        </div>
      )}

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

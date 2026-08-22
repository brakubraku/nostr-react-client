import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { nip19 } from "@nostr-dev-kit/ndk";
import {
  getFavourites,
  isFavorite,
  toggleFavorite as toggleFav,
  removeFavorite,
} from "./favourites";
import {
  formatRelativeTime,
  truncateHex,
  getKindLabel,
  splitContent,
} from "./utils";
import NsfwCheckedImage from "./NsfwCheckedImage";
import AccountCard from "./AccountCard";

/**
 * Shorten content parts so the total text length stays within maxLength,
 * appending "…" where text was cut. Non-text parts are kept as-is.
 */
function truncateText(parts, maxLength) {
  const totalText = parts.reduce(
    (sum, part) => (part.type === "text" ? sum + part.value.length : sum),
    0,
  );
  if (totalText <= maxLength) return parts;

  const truncated = [];
  let remaining = maxLength;
  let cut = false;

  for (const part of parts) {
    if (part.type === "text") {
      if (remaining <= 0) {
        cut = true;
        continue;
      }
      if (part.value.length > remaining) {
        truncated.push({ type: "text", value: part.value.slice(0, remaining) });
        remaining = 0;
        cut = true;
      } else {
        truncated.push(part);
        remaining -= part.value.length;
      }
    } else {
      truncated.push(part);
    }
  }

  if (cut) {
    for (let i = truncated.length - 1; i >= 0; i -= 1) {
      if (truncated[i].type === "text") {
        truncated[i] = { type: "text", value: truncated[i].value + "…" };
        return truncated;
      }
    }
    truncated.push({ type: "text", value: "…" });
  }
  return truncated;
}

/**
 * True when a media URL points to a video (direct file or YouTube/Vimeo).
 */
function isVideoUrl(url) {
  return (
    /\.(?:mp4|webm|ogg)(?:\?[^\s]*)?$/i.test(url) ||
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)/i.test(
      url,
    )
  );
}

/**
 * Resolve a "nostr:" reference from note content into the right component:
 * an AccountCard for profiles (npub/nprofile) or a NostrEventCard for
 * events (note/nevent/naddr). Falls back to the raw reference text when it
 * can't be decoded or the event can't be fetched.
 */
function NostrRefCard({ refValue, ndk }) {
  const [event, setEvent] = useState(undefined);

  const decoded = useMemo(() => {
    try {
      return nip19.decode(refValue.slice("nostr:".length));
    } catch {
      return null;
    }
  }, [refValue]);

  useEffect(() => {
    if (!decoded) {
      setEvent(undefined);
      return;
    }
    if (decoded.type === "npub" || decoded.type === "nprofile") {
      setEvent(undefined);
      return;
    }
    if (!ndk) {
      setEvent(null);
      return;
    }

    let cancelled = false;
    setEvent(undefined);

    async function fetchEvent() {
      try {
        let found = null;
        if (decoded.type === "note") {
          found = await ndk.fetchEvent({ ids: [decoded.data] });
        } else if (decoded.type === "nevent") {
          found = await ndk.fetchEvent({ ids: [decoded.data.id] });
        } else if (decoded.type === "naddr") {
          found = await ndk.fetchEvent({
            kinds: [decoded.data.kind],
            authors: [decoded.data.pubkey],
            "#d": [decoded.data.identifier],
          });
        }
        if (!cancelled) {
          setEvent(found);
        }
      } catch {
        if (!cancelled) {
          setEvent(null);
        }
      }
    }

    fetchEvent();
    return () => {
      cancelled = true;
    };
  }, [decoded, ndk, refValue]);

  if (decoded?.type === "npub" || decoded?.type === "nprofile") {
    const pubkey =
      decoded.type === "npub" ? decoded.data : decoded.data.pubkey;
    return (
      <div
        className="nostr-card__ref nostr-card__ref--account"
        onClick={(e) => e.stopPropagation()}
      >
        <AccountCard pubkey={pubkey} ndk={ndk} />
      </div>
    );
  }

  if (decoded && event) {
    return (
      <div
        className="nostr-card__ref nostr-card__ref--event"
        onClick={(e) => e.stopPropagation()}
      >
        <NostrEventCard event={event} ndk={ndk} />
      </div>
    );
  }

  return <span className="nostr-card__nostr-ref">{refValue}</span>;
}



/**
 * NostrEventCard — a React component that displays a single Nostr event.
 *
 * Props:
 *   event          - An NDKEvent object (or plain object with id, kind, pubkey, content, created_at, tags)
 *   ndk            - Shared NDK instance (provided by App), used for author metadata
 *   showMeta       - Initial visibility of pubkey, id, kind metadata (default: true)
 *   confirmUnfav   - Whether to show a confirmation modal before unfavouriting (default: false)
 *   loading        - When true, renders a pulsing skeleton card instead of content (default: false)
 */
export default function NostrEventCard({
  event,
  ndk,
  confirmUnfav,
  loading = false,
}) {
  const navigate = useNavigate();
  const [authorMeta, setAuthorMeta] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Local state so the "meta" button can show/hide event metadata
  // without having to expand the card first.
  const [showMeta, setShowMeta] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Check if this event is already in favourites on mount and when external changes happen
  useEffect(() => {
    setIsFav(isFavorite(event?.id));
  }, [event?.id]);

  // Subscribe to the favourites observable (reacts to same-tab changes)
  useEffect(() => {
    function handleFavChange() {
      setIsFav(isFavorite(event?.id));
    }
    const unsubscribe = getFavourites.subscribe(handleFavChange);
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
   * Toggle this event's favorite status using the favourites module.
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

  function removeFromFavourites() {
    removeFavorite(event.id);
    setIsFav(false);
  }

  function confirmRemove(e) {
    e.stopPropagation();
    removeFromFavourites();
    setShowConfirmModal(false);
  }

  function cancelConfirm(e) {
    e.stopPropagation();
    setShowConfirmModal(false);
  }

  if (loading) {
    return (
      <div
        className="nostr-card nostr-card--loading"
        role="status"
        aria-label="Loading event"
      >
        <div className="nostr-card__header">
          <div className="nostr-card__author">
            <div
              className="nostr-card__skeleton nostr-card__skeleton--avatar"
              aria-hidden="true"
            />
            <div className="nostr-card__author-info">
              <div
                className="nostr-card__skeleton nostr-card__skeleton--line nostr-card__skeleton--name"
                aria-hidden="true"
              />
              <div
                className="nostr-card__skeleton nostr-card__skeleton--line nostr-card__skeleton--time"
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="nostr-card__header-right">
            <div
              className="nostr-card__skeleton nostr-card__skeleton--badge"
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="nostr-card__content">
          <div
            className="nostr-card__skeleton nostr-card__skeleton--line"
            aria-hidden="true"
          />
          <div
            className="nostr-card__skeleton nostr-card__skeleton--line"
            aria-hidden="true"
          />
          <div
            className="nostr-card__skeleton nostr-card__skeleton--line nostr-card__skeleton--line-short"
            aria-hidden="true"
          />
        </div>
        <div className="nostr-card__footer">
          <div
            className="nostr-card__skeleton nostr-card__skeleton--line nostr-card__skeleton--footer"
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  if (!event) {
    return <div className="nostr-card nostr-card--empty">No event data</div>;
  }

  const { id, kind, pubkey, content, created_at, tags } = event;

  // Parse content into typed parts (text, media URLs, nostr refs)
  const contentParts = splitContent(content || "");
  const displayedParts = expanded
    ? contentParts
    : truncateText(contentParts, 280);
  let imageCount = 0;

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
            className={`nostr-card__fav-btn ${isFav ? "nostr-card__fav-btn--active" : ""}`}
            onClick={toggleFavorite}
            title={isFav ? "Remove from favourites" : "Add to favourites"}
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

      {/* Event content: text, media URLs and nostr refs in splitContent order */}
      <div className="nostr-card__content">
        {kind === 7 ? (
          <p className="nostr-card__reaction">{content || "❤️"}</p>
        ) : (
          displayedParts.map((part, i) => {
            if (part.type === "media-url") {
              const url = part.value;
              if (isVideoUrl(url)) {
                return (
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
                );
              }
              imageCount += 1;
              return (
                <NsfwCheckedImage
                  key={i}
                  className="nostr-card__image"
                  src={url}
                  alt={`Image ${imageCount}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                />
              );
            }

            if (part.type === "nostr") {
              return (
                <NostrRefCard key={i} refValue={part.value} ndk={ndk} />
              );
            }

            return <span key={i}>{part.value}</span>;
          })
        )}
      </div>

      {/* Event metadata (toggleable via the meta button) */}
      {showMeta && (
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
          <div className="nostr-card__meta-row">
            <span className="nostr-card__meta-label">Kind</span>
            <code className="nostr-card__meta-value">{kind}</code>
          </div>
          {tags?.length > 0 && (
            <div className="nostr-card__meta-row">
              <span className="nostr-card__meta-label">Tags</span>
              <code className="nostr-card__meta-value">
                {tags.map((t, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {JSON.stringify(t)}
                  </span>
                ))}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="nostr-card__footer">
        <button
          type="button"
          className="nostr-card__footer-item nostr-card__meta-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowMeta((v) => !v);
          }}
          aria-expanded={showMeta}
          title={showMeta ? "Hide metadata" : "Show metadata"}
        >
          {showMeta ? "▲ meta" : "▼ meta"}
        </button>
        <button
          type="button"
          className="nostr-card__footer-item nostr-card__click-hint"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
          title={expanded ? "Show less" : "Show more"}
        >
          {expanded ? "▲ less" : "▼ more"}
        </button>
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

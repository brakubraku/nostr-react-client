import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NDKEvent, eventIsReply } from "@nostr-dev-kit/ndk";
import { truncateHex } from "./utils";

/**
 * Map a raw reaction content value to the emoji shown in the UI.
 * NIP-25 reactions use "+" to mean an upvote (thumbs up).
 */
function reactionEmoji(content) {
  if (content === "+") return "👍";
  return content || "❤️";
}

/**
 * ReplySidePanel — side panel shown beside an event card inside a Thread.
 *
 * Loads the events that tag the given event, discriminates between replies
 * and reactions (kind 7), and shows two separate counts — one for replies,
 * one for reactions — plus an expand button.
 *
 * Props:
 *   event             - The event whose replies/reactions should be loaded.
 *   ndk               - Shared NDK instance used to subscribe.
 *   onRepliesChange   - Optional callback receiving the loaded replies list,
 *                       so a parent can render them (e.g. Thread's reply group).
 *   onReactionsChange - Optional callback receiving the loaded reactions list.
 */
export default function ReplySidePanel({
  event,
  ndk,
  onRepliesChange,
  onReactionsChange,
  onExpand,
}) {
  const navigate = useNavigate();
  const [replies, setReplies] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [profiles, setProfiles] = useState({});
  const fetchedPubkeys = useRef(new Set());

  // Subscribe to events that tag this event; reactions (kind 7) are kept
  // separately from actual replies.
  useEffect(() => {
    setReplies([]);
    setReactions([]);
    if (!ndk || !event?.id) return;

    const op = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
    let replySub;
    try {
      replySub = ndk.subscribe(
        { "#e": [event.id] },
        {
          onEvent: (replyEvent) => {
            const reply =
              replyEvent instanceof NDKEvent
                ? replyEvent
                : new NDKEvent(ndk, replyEvent);
            // Reactions are kind 7 events; count them separately.
            if (reply.kind === 7) {
              setReactions((prev) =>
                prev.some((r) => r.id === reply.id) ? prev : [...prev, reply],
              );
              return;
            }
            // Keep actual replies, dropping events that merely reference this
            // event (e.g. reposts, mentions).
            if (!eventIsReply(op, reply)) return;
            setReplies((prev) =>
              prev.some((r) => r.id === reply.id) ? prev : [...prev, reply],
            );
          },
        },
      );
    } catch (error) {
      console.error("Failed to subscribe to replies:", error);
    }

    return () => replySub?.stop?.();
  }, [ndk, event]);

  // Report the loaded replies and reactions upward so a parent can render them.
  useEffect(() => {
    onRepliesChange?.(replies);
  }, [replies, onRepliesChange]);

  useEffect(() => {
    onReactionsChange?.(reactions);
  }, [reactions, onReactionsChange]);

  // Fetch profiles of the reaction authors when the modal opens, caching by
  // pubkey so repeated opens (or new reactions arriving) don't re-fetch.
  useEffect(() => {
    if (!showReactionsModal || !ndk) return;
    let cancelled = false;

    const pubkeys = [
      ...new Set(reactions.map((r) => r.pubkey).filter(Boolean)),
    ];
    const pending = pubkeys.filter((pk) => !fetchedPubkeys.current.has(pk));
    pending.forEach((pk) => fetchedPubkeys.current.add(pk));

    Promise.all(
      pending.map(async (pk) => {
        try {
          const user = ndk.getUser({ pubkey: pk });
          await user.fetchProfile();
          return [pk, user.profile || {}];
        } catch {
          return [pk, {}];
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setProfiles((prev) => {
        const next = { ...prev };
        entries.forEach(([pk, profile]) => {
          next[pk] = profile;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [showReactionsModal, reactions, ndk]);

  // Group reactions by their displayed emoji (e.g. "+" becomes a thumbs up),
  // preserving the order in which each group was first seen.
  const reactionGroups = useMemo(() => {
    const groups = new Map();
    reactions.forEach((r) => {
      const key = reactionEmoji(r.content);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    return [...groups.entries()].map(([emoji, list]) => ({ emoji, list }));
  }, [reactions]);

  return (
    <aside
      className="nostr-thread__side-panel"
      aria-label="Replies and reactions"
    >
      <span className="nostr-thread__reply-count">
        {replies.length}
        <span className="nostr-thread__reply-label">
          {replies.length !== 1 ? "replies" : "reply"}
        </span>
      </span>
      <button
        type="button"
        className="nostr-thread__reaction-count"
        title="Show who reacted"
        onClick={() => setShowReactionsModal(true)}
      >
        {reactions.length}
        <span className="nostr-thread__reaction-label">
          {reactions.length !== 1 ? "reactions" : "reaction"}
        </span>
      </button>
      <button
        type="button"
        className="nostr-thread__expand-btn"
        title="Expand replies"
        onClick={onExpand}
      >
        ▼ Expand
      </button>

      {showReactionsModal && (
        <div
          className="nostr-thread__modal-overlay"
          onClick={() => setShowReactionsModal(false)}
        >
          <div
            className="nostr-thread__modal"
            role="dialog"
            aria-label="Reactions"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nostr-thread__modal-header">
              <h3 className="nostr-thread__modal-title">Reactions</h3>
              <button
                type="button"
                className="nostr-thread__modal-close"
                aria-label="Close reactions"
                onClick={() => setShowReactionsModal(false)}
              >
                ✕
              </button>
            </div>
            {reactionGroups.length === 0 ? (
              <p className="nostr-thread__modal-empty">No reactions yet.</p>
            ) : (
              <div className="nostr-thread__modal-groups">
                {reactionGroups.map((group) => (
                  <section
                    key={group.emoji}
                    className="nostr-thread__reaction-group"
                  >
                    <header className="nostr-thread__reaction-group-head">
                      <span className="nostr-thread__reaction-group-emoji">
                        {group.emoji}
                      </span>
                      <span className="nostr-thread__reaction-group-count">
                        {group.list.length}
                      </span>
                    </header>
                    <ul className="nostr-thread__reaction-profiles">
                      {group.list.map((r) => {
                        const profile = profiles[r.pubkey] || {};
                        const displayName =
                          profile.displayName ||
                          profile.name ||
                          truncateHex(r.pubkey);
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              className="nostr-thread__reaction-profile"
                              title={`View ${displayName}'s profile`}
                              onClick={() => navigate(`/profile/${r.pubkey}`)}
                            >
                              {profile.picture ? (
                                <img
                                  className="nostr-thread__reaction-avatar"
                                  src={profile.picture}
                                  alt=""
                                  loading="lazy"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="nostr-thread__reaction-avatar nostr-thread__reaction-avatar--placeholder">
                                  {displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="nostr-thread__reaction-name">
                                {displayName}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

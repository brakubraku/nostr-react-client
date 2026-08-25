import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NDKEvent, eventIsReply } from "@nostr-dev-kit/ndk";
import { truncateHex } from "./utils";
import NostrEventCard from "./NostrEventCard";

/**
 * Map a raw reaction content value to the emoji shown in the UI.
 * NIP-25 reactions use "+" to mean an upvote (thumbs up).
 */
function reactionEmoji(content) {
  if (content === "+") return "👍";
  return content || "❤️";
}

/**
 * EventWithReplies — an event together with its loaded replies and the
 * replies/reactions side panel, all in one self-contained component.
 *
 * This combines what used to be two coupled components — a reply side panel
 * (which loaded the events tagging an event and split them into replies and
 * reactions) and the event-with-replies wrapper (which rendered the event card
 * and stacked the loaded replies below). Fusing them removes the prop wiring
 * (onRepliesChange / onReactionsChange / onExpand) that connected them.
 *
 * The side panel (reply count, reaction count, expand button and reactions
 * modal) is rendered inline beside the event card, and the replies it loads are
 * rendered directly in the reply group below. Each reply is itself wrapped in
 * an EventWithReplies, so deeper chains recurse naturally. The reply group
 * only renders once it has been expanded and there are replies to show.
 *
 * Props:
 *   event             - The event whose replies/reactions should be rendered.
 *   ndk               - Shared NDK instance used to subscribe.
 *   showReplies       - Whether the reply group starts visible.
 *   continuationReply - The reply that continues the thread chain; rendered at
 *                       the top of the reply group so the chain stays readable.
 *                       Shape: { event, body }
 */
export default function EventWithReplies({
  event,
  ndk,
  showReplies = false,
  continuationReply,
}) {
  const navigate = useNavigate();
  const [replies, setReplies] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [repliesVisible, setRepliesVisible] = useState(showReplies);
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
    <div className="nostr-thread__event-with-replies">
      <div className="nostr-thread__event">
        <NostrEventCard event={event} ndk={ndk} />
        <aside
          className="nostr-thread__side-panel"
          aria-label="Replies and reactions"
        >
          {replies.length > 0 && (
            <span className="nostr-thread__reply-count">
              {replies.length}
              <span className="nostr-thread__reply-label">
                {replies.length !== 1 ? "replies" : "reply"}
              </span>
            </span>
          )}
          {reactions.length > 0 && (
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
          )}
          {replies.length > 0 && (
            <button
              type="button"
              className="nostr-thread__expand-btn"
              title="Expand replies"
              onClick={() => setRepliesVisible((prev) => !prev)}
            >
              ▼ Expand
            </button>
          )}

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
                                  onClick={() =>
                                    navigate(`/profile/${r.pubkey}`)
                                  }
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
      </div>
      {repliesVisible && replies.length > 0 && (
        <div className="nostr-thread__reply-group">
          {continuationReply && continuationReply.body}
          {replies.map((reply) => {
            if (reply.id === continuationReply?.event.id) return; // already added above
            return <EventWithReplies key={reply.id} event={reply} ndk={ndk} />;
          })}
        </div>
      )}
    </div>
  );
}

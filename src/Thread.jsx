import { useEffect, useState } from "react";
import { NDKEvent, eventIsReply } from "@nostr-dev-kit/ndk";
import NostrEventCard from "./NostrEventCard";

/**
 * ReplySidePanel — presentational side panel with a reply count and an
 * expand button. No behavior is wired up yet.
 */
function ReplySidePanel({ count }) {
  return (
    <aside className="nostr-thread__side-panel" aria-label="Replies">
      <span className="nostr-thread__reply-count">
        {count}
        <span className="nostr-thread__reply-label">
          {count !== 1 ? "replies" : "reply"}
        </span>
      </span>
      <button
        type="button"
        className="nostr-thread__expand-btn"
        title="Expand replies"
      >
        ▼ Expand
      </button>
    </aside>
  );
}

/**
 * Thread — displays a Nostr event together with its context:
 *
 *   parent event (if it exists)          ─ shown above the main event
 *   main event                           ─ the event passed as a prop
 *   replies                              ─ stacked below the main event
 *
 * Props:
 *   event - An NDKEvent object (or plain object with id, kind, pubkey, content, created_at, tags)
 *   ndk   - Shared NDK instance, used to fetch the parent and subscribe to replies
 */
export default function Thread({
  event,
  ndk,
  showReplies = true,
  showParent = true,
}) {
  const [parentEvent, setParentEvent] = useState(null);
  const [replies, setReplies] = useState([]);

  // Fetch the parent event this event replies to, if any.
  useEffect(() => {
    let cancelled = false;
    setParentEvent(null);

    if (!ndk || !event?.id || !showParent) return;

    const op = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
    op.fetchReplyEvent()
      .then((parent) => {
        if (!cancelled && parent) setParentEvent(parent);
      })
      .catch((error) => {
        console.error("Failed to fetch parent event:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [ndk, event]);

  // Subscribe to replies to this event (events that tag it as a reply target).
  useEffect(() => {
    setReplies([]);
    if (!ndk || !event?.id || !showReplies) return;

    const op = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
    const replySub = ndk.subscribe(
      { "#e": [event.id] },
      {
        onEvent: (replyEvent) => {
          const reply =
            replyEvent instanceof NDKEvent
              ? replyEvent
              : new NDKEvent(ndk, replyEvent);
          // Keep actual replies, dropping events that merely reference this
          // event (e.g. reposts, reactions, mentions).
          if (!eventIsReply(op, reply)) return;
          setReplies((prev) =>
            prev.some((r) => r.id === reply.id) ? prev : [...prev, reply],
          );
        },
      },
    );

    return () => replySub?.stop?.();
  }, [ndk, event, showReplies]);

  if (!event) {
    return <div className="nostr-card nostr-card--empty">No event data</div>;
  }

  return (
    <div className="nostr-thread">
      {parentEvent && (
        <div className="nostr-thread__parent">
          <div className="nostr-thread__event">
            <NostrEventCard event={parentEvent} ndk={ndk} />
            <ReplySidePanel count={0} />
          </div>
        </div>
      )}

      <div
        className={
          parentEvent
            ? "nostr-thread__reply-group nostr-thread__reply-group--main"
            : undefined
        }
      >
        <div className="nostr-thread__event">
          <NostrEventCard event={event} ndk={ndk} />
          <ReplySidePanel count={replies.length} />
        </div>
      </div>

      {replies.length > 0 && (
        <div
          className={
            parentEvent
              ? "nostr-thread__reply-group nostr-thread__reply-group--nested"
              : "nostr-thread__reply-group"
          }
        >
          {replies.map((reply) => (
            <div className="nostr-thread__event" key={reply.id}>
              <NostrEventCard event={reply} ndk={ndk} />
              <ReplySidePanel count={0} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

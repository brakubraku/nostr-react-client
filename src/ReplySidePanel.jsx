import { useEffect, useState } from "react";
import { NDKEvent, eventIsReply } from "@nostr-dev-kit/ndk";

/**
 * ReplySidePanel — side panel shown beside an event card inside a Thread.
 *
 * Loads the replies to the given event (events that tag it as a reply
 * target) and shows the current reply count plus an expand button.
 *
 * Props:
 *   event           - The event whose replies should be loaded.
 *   ndk             - Shared NDK instance used to subscribe to replies.
 *   onRepliesChange - Optional callback receiving the loaded replies list,
 *                     so a parent can render them (e.g. Thread's reply group).
 */
export default function ReplySidePanel({
  event,
  ndk,
  onRepliesChange,
  onExpand,
}) {
  const [replies, setReplies] = useState([]);

  // Subscribe to replies to this event (events that tag it as a reply target).
  useEffect(() => {
    setReplies([]);
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
            // Keep actual replies, dropping events that merely reference this
            // event (e.g. reposts, reactions, mentions).
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

  // Report the loaded replies upward so a parent can render them.
  useEffect(() => {
    onRepliesChange?.(replies);
  }, [replies, onRepliesChange]);

  return (
    <aside className="nostr-thread__side-panel" aria-label="Replies">
      <span className="nostr-thread__reply-count">
        {replies.length}
        <span className="nostr-thread__reply-label">
          {replies.length !== 1 ? "replies" : "reply"}
        </span>
      </span>
      <button
        type="button"
        className="nostr-thread__expand-btn"
        title="Expand replies"
        onClick={onExpand}
      >
        ▼ Expand
      </button>
    </aside>
  );
}

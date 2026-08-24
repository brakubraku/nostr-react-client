import { useEffect, useState } from "react";
import { NDKEvent, eventIsReply } from "@nostr-dev-kit/ndk";

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
  const [replies, setReplies] = useState([]);
  const [reactions, setReactions] = useState([]);

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
                prev.some((r) => r.id === reply.id)
                  ? prev
                  : [...prev, reply],
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
      <span className="nostr-thread__reaction-count">
        {reactions.length}
        <span className="nostr-thread__reaction-label">
          {reactions.length !== 1 ? "reactions" : "reaction"}
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

import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import NostrEventCard from "./NostrEventCard";
import ReplySidePanel from "./ReplySidePanel";

/**
 * Thread — displays a Nostr event together with its context:
 *
 *   parent event (if it exists)          ─ shown above the main event
 *   main event                           ─ the event passed as a prop
 *   replies                              ─ stacked below the main event
 *
 * Props:
 *   event - An NDKEvent object (or plain object with id, kind, pubkey, content, created_at, tags)
 *   ndk   - Shared NDK instance, used to fetch the parent and load replies
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

  if (!event) {
    return <div className="nostr-card nostr-card--empty">No event data</div>;
  }

  return (
    <div className="nostr-thread">
      {parentEvent && (
        <div className="nostr-thread__parent">
          <div className="nostr-thread__event">
            <NostrEventCard event={parentEvent} ndk={ndk} />
            <ReplySidePanel event={parentEvent} ndk={ndk} />
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
          <ReplySidePanel
            event={event}
            ndk={ndk}
            showReplies={showReplies}
            onRepliesChange={setReplies}
          />
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
              <ReplySidePanel event={reply} ndk={ndk} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

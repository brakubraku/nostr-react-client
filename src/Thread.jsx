import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import NostrEventCard from "./NostrEventCard";
import ReplySidePanel from "./ReplySidePanel";

function EventWithReplies({ event, ndk, showReplies = false }) {
  const [replies, setReplies] = useState([]);
  const [isShowReplies, setIsShowReplies] = useState(showReplies);

  return (
    <div className="nostr-thread__event-with-replies">
      <div className="nostr-thread__event">
        <NostrEventCard event={event} ndk={ndk} />
        <ReplySidePanel
          event={event}
          ndk={ndk}
          onRepliesChange={setReplies}
          onExpand={() => setIsShowReplies(!isShowReplies)}
        />
      </div>
      {isShowReplies && replies.length > 0 && (
        <div className="nostr-thread__reply-group">
          {replies.map((reply) => (
            <EventWithReplies key={reply.id} event={reply} ndk={ndk} />
          ))}
        </div>
      )}
    </div>
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
 *   ndk   - Shared NDK instance, used to fetch the parent and load replies
 */
export default function Thread({ event, ndk, showParent = true }) {
  const [parentEvent, setParentEvent] = useState(null);
  const [isExpandParent, setExpandParent] = useState(false);

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
  }, [ndk, event, showParent]);

  if (!event) {
    return <div className="nostr-card nostr-card--empty">No event data</div>;
  }

  const threadBody = (
    <div className="nostr-thread">
      {parentEvent && (
        <div className="nostr-thread__parent">
          <div className="nostr-thread__event">
            <NostrEventCard event={parentEvent} ndk={ndk} />
            <ReplySidePanel
              event={parentEvent}
              ndk={ndk}
              onExpand={() => setExpandParent(!isExpandParent)}
            />
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
        <EventWithReplies event={event} ndk={ndk} />
      </div>
    </div>
  );

  if (isExpandParent) {
    return <Thread event={parentEvent} ndk={ndk} />;
  }

  return <div className="nostr-thread__scroll">{threadBody}</div>;
}

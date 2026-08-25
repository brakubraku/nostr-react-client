import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { logger } from "./logger";
import NostrEventCard from "./NostrEventCard";
import ReplySidePanel from "./ReplySidePanel";

function EventWithReplies({
  event,
  ndk,
  showReplies = false,
  onShowReplies,
  continuationReply,
}) {
  const [replies, setReplies] = useState([]);
  const [repliesVisible, setRepliesVisible] = useState(showReplies);

  return (
    <div className="nostr-thread__event-with-replies">
      <div className="nostr-thread__event">
        <NostrEventCard event={event} ndk={ndk} />
        <ReplySidePanel
          event={event}
          ndk={ndk}
          onRepliesChange={setReplies}
          onExpand={() => {
            const nextVisible = !repliesVisible;
            setRepliesVisible(nextVisible);
            onShowReplies?.(nextVisible);
          }}
        />
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

/**
 * Thread - displays a Nostr event together with its context:
 *
 *   parent event (if it exists)     - shown above the main event (collapsed by default)
 *   main event                      - the event passed as a prop
 *   replies                         - stacked below the main event
 *
 * Props:
 *   event             - An NDKEvent object (or plain object with id, kind, pubkey,
 *                       content, created_at, tags)
 *   ndk               - Shared NDK instance, used to fetch the parent and load replies
 *   showParent     - Whether the parent event is shown expanded by default
 *   showReplies       - Whether the reply group starts visible
 *   continuationReply - The reply that continues the thread chain; rendered at the top
 *                       of the reply group so the chain stays readable
 */
export default function Thread({
  event,
  ndk,
  showParent = false,
  continuationReply,
  showReplies,
}) {
  const [parentEvent, setParentEvent] = useState(null);
  const [parentExpanded, setParentExpanded] = useState(showParent);

  // Fetch the parent event this event replies to, if any.
  useEffect(() => {
    let cancelled = false;
    setParentEvent(null);

    if (!ndk || !event?.id) return;

    const ndkEvent =
      event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
    ndkEvent
      .fetchReplyEvent()
      .then((parent) => {
        if (!cancelled && parent) setParentEvent(parent);
      })
      .catch((error) => {
        logger.error("Failed to fetch parent event", {
          eventId: event.id,
          message: error?.message || String(error),
          stack: error?.stack,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [ndk, event, showParent]);

  if (!event) {
    return <div className="nostr-card nostr-card--empty">No event data</div>;
  }

  const eventView = (
    <EventWithReplies
      event={event}
      ndk={ndk}
      continuationReply={continuationReply}
      showReplies={showReplies}
    />
  );

  let threadBody = null;

  if (parentEvent && parentExpanded) {
    threadBody = (
      <Thread
        event={parentEvent}
        ndk={ndk}
        continuationReply={{ event: { ...event }, body: eventView }}
        showReplies={true}
      />
    );
  } else {
    threadBody = (
      <div className="nostr-thread">
        {parentEvent && !parentExpanded && (
          <>
            <button
              type="button"
              className="nostr-thread__parent"
              onClick={() => setParentExpanded((prev) => !prev)}
              aria-label="Show parent event"
              title="Show parent event"
            >
              <span className="nostr-thread__parent-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            {eventView}
          </>
        )}
        {!parentEvent && eventView}
      </div>
    );
  }

  return <div className="nostr-thread__scroll">{threadBody}</div>;
}

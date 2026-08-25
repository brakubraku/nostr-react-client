import { useEffect, useState } from "react";
import { NDKEvent, eventIsReply } from "@nostr-dev-kit/ndk";
import EventWithReplies from "./EventWithReplies";

/** Number of replies rendered per page. */
const PAGE_SIZE = 5;

/**
 * PagedReplies — queries the replies that tag an event and renders them in
 * pages, taking over the reply querying from EventWithReplies.
 *
 * It subscribes to events that tag the given event, keeps the actual replies
 * (dropping reactions and non-reply references) and reports them up via
 * onRepliesChange so the parent can show a reply count. Replies are rendered
 * in pages of PAGE_SIZE (5) inside the same reply-group template, with
 * previous/next controls to move between pages. Each reply is itself wrapped
 * in an EventWithReplies, so deeper chains recurse naturally.
 *
 * Props:
 *   event             - The event whose replies should be queried and rendered.
 *   ndk               - Shared NDK instance used to subscribe.
 *   visible           - Whether the reply group should render (the parent's
 *                       expand state). The query still runs while hidden so the
 *                       count stays ready.
 *   continuationReply - The reply that continues the thread chain; rendered at
 *                       the top of the reply group so the chain stays readable.
 *                       Shape: { event, body }
 *   onRepliesChange   - Optional callback receiving the loaded replies list, so
 *                       a parent can show the reply count (e.g. side panel).
 */
export default function PagedReplies({
  event,
  ndk,
  visible = false,
  continuationReply,
  onRepliesChange,
}) {
  const [replies, setReplies] = useState([]);
  const [page, setPage] = useState(1);

  // Query the replies that tag this event; reactions (kind 7) are not replies.
  useEffect(() => {
    setReplies([]);
    setPage(1);
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
            // Reactions are handled elsewhere; they are not replies.
            if (reply.kind === 7) return;
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

  // Report the loaded replies upward so the parent can show the reply count.
  useEffect(() => {
    onRepliesChange?.(replies);
  }, [replies, onRepliesChange]);

  if (!visible || replies.length === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(replies.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageReplies = replies.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="nostr-thread__reply-group">
      {continuationReply && continuationReply.body}
      {pageReplies.map((reply) => {
        if (reply.id === continuationReply?.event.id) return; // already added above
        return <EventWithReplies key={reply.id} event={reply} ndk={ndk} />;
      })}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <button
            type="button"
            className="nostr-thread__expand-btn"
            title="Previous page"
            disabled={currentPage <= 1}
            style={
              currentPage <= 1
                ? { opacity: 0.5, cursor: "not-allowed" }
                : undefined
            }
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            ◀ Prev
          </button>
          <span style={{ fontSize: "12px", color: "var(--text)" }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="nostr-thread__expand-btn"
            title="Next page"
            disabled={currentPage >= totalPages}
            style={
              currentPage >= totalPages
                ? { opacity: 0.5, cursor: "not-allowed" }
                : undefined
            }
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next ▶
          </button>
        </div>
      )}
    </div>
  );
}

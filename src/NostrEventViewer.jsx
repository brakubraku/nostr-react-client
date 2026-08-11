import { useState, useEffect } from "react";
import NostrEventCard from "./NostrEventCard";
import NostrFeed from "./NostrFeed";

/**
 * NostrEventViewer — a parent component that lets you either:
 *
 * 1. View a single event by its ID (fetched from relays)
 * 2. Browse a live feed of events
 *
 * Props:
 *   ndk       - Shared NDK instance (provided by App)
 *   eventId   - Fetch and display a single event by ID (optional)
 *   relayUrls - Array of relay WebSocket URLs (optional)
 *   mode      - "single" | "feed" — display mode (default: "feed")
 */
export default function NostrEventViewer({
  ndk,
  eventId,
  relayUrls = ["wss://relay.primal.net"],
  mode,
}) {
  const [singleEvent, setSingleEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [connected, setConnected] = useState(false);

  // Connect the shared NDK instance passed via props
  useEffect(() => {
    if (!ndk) return;

    let cancelled = false;

    ndk.connect().then(() => {
      if (!cancelled) setConnected(true);
    });

    return () => {
      cancelled = true;
    };
  }, [ndk, relayUrls.join(",")]);

  // Fetch a single event by ID if eventId is provided
  useEffect(() => {
    if (!eventId || !ndk || !connected) return;

    let cancelled = false;

    async function fetchEvent() {
      setLoading(true);
      setFetchError(null);

      try {
        // Try fetching by event id — NDK doesn't have a direct fetchEventById,
        // so we filter by ids array
        const events = await ndk.fetchEvents({ ids: [eventId], limit: 1 });
        if (!cancelled) {
          if (events && events.size > 0) {
            setSingleEvent(events.values().next().value);
          } else {
            setFetchError("Event not found on the connected relays.");
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(`Error fetching event: ${err.message}`);
          setLoading(false);
        }
      }
    }

    fetchEvent();

    return () => {
      cancelled = true;
    };
  }, [eventId, ndk, connected]);

  // --- Render ---

  if (mode === "single") {
    return (
      <div className="nostr-viewer">
        <h2 className="nostr-viewer__title">Nostr Event Viewer</h2>

        {eventId && (
          <div className="nostr-viewer__event-id">
            Event ID: <code>{eventId}</code>
          </div>
        )}

        {loading && <div className="nostr-viewer__loading">Loading event…</div>}

        {fetchError && (
          <div className="nostr-viewer__error">⚠️ {fetchError}</div>
        )}

        {singleEvent && !loading && (
          <NostrEventCard event={singleEvent} ndk={ndk} />
        )}

        {!eventId && !loading && (
          <div className="nostr-viewer__placeholder">
            Pass an <code>eventId</code> prop to view a specific event.
          </div>
        )}
      </div>
    );
  }

  // Default: feed mode

  return <NostrFeed relayUrls={relayUrls} ndk={ndk} />;
}

import { useState, useEffect, useCallback, useRef } from "react";
import Thread from "./Thread";

/**
 * Default relay URLs to connect to.
 */
const DEFAULT_RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.damus.io",
];

/**
 * Content type options shown in the feed dropdown. Each option maps to the
 * Nostr event kinds requested from the relays.
 */
const CONTENT_TYPE_OPTIONS = [
  { value: "longform", label: "Long-form content", kinds: [30023] },
  { value: "notes", label: "Text notes", kinds: [1] },
];

/**
 * NostrFeed — a React component that subscribes to a Nostr relay and
 * displays a live-updating feed of events.
 *
 * Props:
 *   ndk       - Shared NDK instance (provided by App)
 *   relayUrls - Array of relay WebSocket URLs (default: see DEFAULT_RELAYS)
 *   filter    - NDK subscription filter object (default: { kinds: [1], limit: 20 })
 *   limit     - Max number of events to keep in the feed (default: 50)
 *   defaultContentType - Content type selected initially (default: "longform")
 *   contentTypeOptions - Options for the content type dropdown
 */
export default function NostrFeed({
  ndk,
  relayUrls = DEFAULT_RELAYS,
  filter = { kinds: [1], limit: 20 },
  limit = 50,
  defaultContentType = "longform",
  contentTypeOptions = CONTENT_TYPE_OPTIONS,
}) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const [contentType, setContentType] = useState(defaultContentType);
  const subRef = useRef(null);

  // Resolve the selected content type and build the subscription filter.
  // The dropdown overrides any `kinds` from the filter prop; everything else
  // (e.g. limit) is preserved.
  const selectedContentType =
    contentTypeOptions.find((option) => option.value === contentType) ||
    contentTypeOptions[0];
  const activeFilter = { ...filter };
  activeFilter.kinds = selectedContentType.kinds;

  // Subscribe using the shared NDK instance passed via props
  useEffect(() => {
    if (!ndk) return;

    let cancelled = false;

    async function connectAndSubscribe() {
      try {
        await ndk.connect((5 * 10) ^ 6);
        if (cancelled) return;
        setConnected(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to connect to relays: ${err.message}`);
          setConnected(false);
        }
        return;
      }

      // Subscribe with the provided filter
      const sub = ndk.subscribe(activeFilter, {
        closeOnEose: false,
        onEvent: (event) => {
          if (cancelled) return;
          if (paused) return;
          setEvents((prev) => {
            // Avoid duplicates by event id
            if (prev.some((e) => e.id === event.id)) return prev;
            const updated = [event, ...prev];
            return updated.slice(0, limit);
          });
        },
        onEose: () => {
          // End of stored events signal — we keep listening for new ones
        },
      });

      subRef.current = sub;
    }

    connectAndSubscribe();

    return () => {
      cancelled = true;
      if (subRef.current) {
        subRef.current.stop();
      }
    };
  }, [ndk, relayUrls.join(","), JSON.stringify(activeFilter), limit, paused]);

  return (
    <div className="nostr-feed">
      <div className="nostr-feed__header">
        <h2 className="nostr-feed__title">Unfiltered global feed</h2>
        <div className="nostr-feed__controls">
          <select
            className="nostr-feed__content-type"
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            aria-label="Content type"
            title="Choose what to show in the feed"
          >
            {contentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="nostr-feed__status">
            <span
              className={`nostr-feed__dot ${connected ? "nostr-feed__dot--connected" : "nostr-feed__dot--disconnected"}`}
            />
            {connected ? "Connected" : "Disconnected"}
          </div>
          <button
            title={paused ? "Resume feed" : "Pause feed"}
            onClick={() => setPaused((prev) => !prev)}
          >
            {paused ? (
              <svg
                className="nostr-feed__pause-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
            ) : (
              <svg
                className="nostr-feed__pause-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="nostr-feed__error">
          ⚠️ {error}
          <button
            className="nostr-feed__retry-btn"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="nostr-feed__events">
        {events.length === 0 && !error && (
          <div className="nostr-feed__empty">
            {connected ? "Waiting for events…" : "Connecting to relays…"}
          </div>
        )}

        {events.map((event) => (
          <Thread key={event.id} event={event} ndk={ndk} />
        ))}
      </div>

      <div className="nostr-feed__footer">
        <span className="nostr-feed__count">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
        <span className="nostr-feed__relays">
          Relays: {relayUrls.map((u) => new URL(u).hostname).join(", ")}
        </span>
      </div>
    </div>
  );
}

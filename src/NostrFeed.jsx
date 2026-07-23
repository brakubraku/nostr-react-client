import { useState, useEffect, useCallback, useRef } from "react";
import NDK, { filterAndRelaySetFromBech32 } from "@nostr-dev-kit/ndk";
import NostrEventCard from "./NostrEventCard";

/**
 * Default relay URLs to connect to.
 */
const DEFAULT_RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.damus.io",
];

/**
 * NostrFeed — a React component that subscribes to a Nostr relay and
 * displays a live-updating feed of events.
 *
 * Props:
 *   relayUrls   - Array of relay WebSocket URLs (default: see DEFAULT_RELAYS)
 *   filter      - NDK subscription filter object (default: { kinds: [1], limit: 20 })
 *   limit       - Max number of events to keep in the feed (default: 50)
 *   showMeta    - Passed through to NostrEventCard
 */
export default function NostrFeed({
  relayUrls = DEFAULT_RELAYS,
  filter = { kinds: [1], limit: 20 },
  limit = 50,
  showMeta = true,
}) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const ndkRef = useRef(null);
  const subRef = useRef(null);

  // Initialize NDK and subscribe
  useEffect(() => {
    const ndk = new NDK({
      explicitRelayUrls: relayUrls,
      aiGuardrails: true,
    });

    ndkRef.current = ndk;

    let cancelled = false;

    async function connectAndSubscribe() {
      try {
        await ndk.connect(10 ^ 6);
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
      const sub = ndk.subscribe(filter, {
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
      ndkRef.current = null;
    };
  }, [relayUrls.join(","), JSON.stringify(filter), limit, paused]);

  /**
   * Load events for a specific user.
   */
  const loadUserEvents = useCallback(
    async (pubkey) => {
      if (!ndkRef.current) return;

      const ndk = ndkRef.current;
      const fetchedEvents = await ndk.fetchEvents({
        authors: [pubkey],
        kinds: [1],
        limit: 20,
      });

      const sorted = [...fetchedEvents].sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0),
      );

      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = sorted.filter((e) => !existingIds.has(e.id));
        return [...newEvents, ...prev].slice(0, limit);
      });
    },
    [limit],
  );

  return (
    <div className="nostr-feed">
      <div className="nostr-feed__header">
        <h2 className="nostr-feed__title">Nostr Feed</h2>
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
          <NostrEventCard
            key={event.id}
            event={event}
            ndk={ndkRef.current}
            showMeta={showMeta}
          />
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

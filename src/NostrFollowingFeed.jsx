import { useState, useEffect, useRef } from "react";
import Thread from "./Thread";
import { getFollows } from "./follows";
import { setGauge, traceSync } from "./observability";

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
 * NostrFollowingFeed — a feed that subscribes to events from the accounts in
 * the local follows list only. Unlike NostrFeed (which subscribes to the
 * global feed), the subscription filter includes an `authors` array built
 * from the followed pubkeys, so relays only send events authored by people
 * you follow.
 *
 * The follows list is read reactively from follows.js (both same-tab changes
 * via the observable and cross-tab changes via the `storage` event); when it
 * changes the subscription is rebuilt. With no followed accounts nothing is
 * subscribed and an empty state is shown instead.
 *
 * Props:
 *   ndk       - Shared NDK instance (provided by App)
 *   relayUrls - Array of relay WebSocket URLs (default: see DEFAULT_RELAYS)
 *   limit     - Max number of events to keep in the feed (default: 50)
 *   defaultContentType - Content type selected initially (default: "longform")
 *   contentTypeOptions - Options for the content type dropdown
 */
export default function NostrFollowingFeed({
  ndk,
  relayUrls = DEFAULT_RELAYS,
  limit = 50,
  defaultContentType = "longform",
  contentTypeOptions = CONTENT_TYPE_OPTIONS,
}) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const [contentType, setContentType] = useState(defaultContentType);
  const [follows, setFollows] = useState(getFollows);
  const subRef = useRef(null);

  // Keep the observability "followingFeed.events" memory gauge in sync.
  useEffect(() => {
    setGauge("followingFeed.events", events.length);
  }, [events]);

  // Keep the follows list in sync with the follows store: react to changes
  // within the same tab (observable) and from other tabs (storage event).
  useEffect(() => {
    function syncFollows() {
      setFollows(getFollows());
    }

    const unsubscribe = getFollows.subscribe(syncFollows);
    window.addEventListener("storage", syncFollows);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", syncFollows);
    };
  }, []);

  const followedPubkeys = follows.map((account) => account.pubkey);
  const followedKey = followedPubkeys.join(",");

  // Resolve the selected content type and build the subscription filter.
  // When accounts are followed, the filter is scoped to their pubkeys.
  const selectedContentType =
    contentTypeOptions.find((option) => option.value === contentType) ||
    contentTypeOptions[0];
  const activeFilter = {
    kinds: selectedContentType.kinds,
    limit,
    ...(followedPubkeys.length > 0 ? { authors: followedPubkeys } : {}),
  };

  // When the set of followed authors changes, events from the previous
  // subscription no longer match the new filter, so clear them before the
  // subscription effect below rebuilds the subscription.
  useEffect(() => {
    setEvents([]);
  }, [followedKey]);

  // Subscribe using the shared NDK instance passed via props. With no
  // followed accounts we don't subscribe at all and just show the empty state.
  useEffect(() => {
    if (!ndk) return;

    let cancelled = false;

    async function connectAndSubscribe() {
      if (followedPubkeys.length === 0) {
        if (!cancelled) {
          setConnected(false);
          setError(null);
        }
        return;
      }

      try {
        await ndk.connect(5000);
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

      // Subscribe with the scoped filter (authors = followed pubkeys)
      const sub = ndk.subscribe(activeFilter, {
        closeOnEose: false,
        onEvent: (event) => {
          if (cancelled) return;
          if (paused) return;
          traceSync("followingFeed.onEvent", () => {
            setEvents((prev) => {
              // Avoid duplicates by event id
              if (prev.some((e) => e.id === event.id)) return prev;
              const updated = [event, ...prev];
              return updated.slice(0, limit);
            });
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
  }, [
    ndk,
    relayUrls.join(","),
    JSON.stringify(activeFilter),
    followedKey,
    limit,
    paused,
  ]);

  return (
    <div className="nostr-feed">
      <div className="nostr-feed__header">
        <h2 className="nostr-feed__title">Following feed</h2>
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
            {connected
              ? "Connected"
              : follows.length === 0
                ? "No follows"
                : "Disconnected"}
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
        {follows.length === 0 ? (
          <div className="nostr-feed__empty">
            <p>You're not following any accounts yet.</p>
            <p className="nostr-feed__hint">
              Follow some accounts to build your feed.
            </p>
          </div>
        ) : events.length === 0 && !error ? (
          <div className="nostr-feed__empty">
            {connected ? "Waiting for events…" : "Connecting to relays…"}
          </div>
        ) : (
          events.map((event) => (
            <Thread key={event.id} event={event} ndk={ndk} />
          ))
        )}
      </div>

      <div className="nostr-feed__footer">
        <span className="nostr-feed__count">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
        <span className="nostr-feed__relays">
          {follows.length} followed account{follows.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

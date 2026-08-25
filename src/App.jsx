import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { connectNDK, getNDK } from "./ndk";
import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";
import NostrFeed from "./NostrFeed";
import NostrEventViewer from "./NostrEventViewer";
import NostrFavourites from "./NostrFavourites";
import NostrFollowing from "./NostrFollowing";
import NostrProfile from "./NostrProfile";
import ErrorPanel from "./ErrorPanel";
import "./App.css";

// Relay set used for the live feed and the shared NDK instance. App is the
// single owner of the NDK instance; every other component receives it via
// the `ndk` prop instead of importing the ndk module.
const FEED_RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.damus.io",
];

// Persistent (IndexedDB) cache for events and profiles, shared by the NDK
// instance. It must be attached when the instance is created (below).
const ndkCacheAdapter = new NDKCacheAdapterDexie({
  dbName: "nostr-events-cache",
});

function AppLayout() {
  const [ndk, setNdk] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Create and connect the shared NDK instance once when the app mounts.
  // Until ndk is assigned (non-null) only a spinner is rendered, so no
  // component ever receives a null ndk. connectNDK reuses the instance
  // created by getNDK; failures are logged by the ndk module.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const instance = getNDK({
        explicitRelayUrls: FEED_RELAYS,
        cacheAdapter: ndkCacheAdapter,
      });
      try {
        await connectNDK({
          explicitRelayUrls: FEED_RELAYS,
          cacheAdapter: ndkCacheAdapter,
          timeout: 10000,
        });
      } catch (err) {
        if (!cancelled) console.error("Failed to connect shared NDK:", err);
      }
      if (!cancelled) setNdk(instance);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Wait for the NDK instance before rendering the app, so components never
  // receive a null ndk prop.
  if (!ndk) {
    return (
      <div className="app">
        <div className="app__loading" role="status" aria-label="Loading">
          <span className="app__spinner" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <ErrorPanel />
      <header className="app__header">
        {/* <h1>Nostr Events</h1> */}
        <nav className="app__nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `app__nav-btn ${isActive ? "app__nav-btn--active" : ""}`
            }
          >
            Live Feed
          </NavLink>
          <NavLink
            to="/viewer"
            className={({ isActive }) =>
              `app__nav-btn ${isActive ? "app__nav-btn--active" : ""}`
            }
          >
            Event Lookup
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `app__nav-btn ${isActive ? "app__nav-btn--active" : ""}`
            }
          >
            Profile
          </NavLink>
          <NavLink
            to="/favourites"
            className={({ isActive }) =>
              `app__nav-btn ${isActive ? "app__nav-btn--active" : ""}`
            }
          >
            ⭐ Favourites
          </NavLink>
          <NavLink
            to="/following"
            className={({ isActive }) =>
              `app__nav-btn ${isActive ? "app__nav-btn--active" : ""}`
            }
          >
            👥 Following
          </NavLink>
        </nav>
      </header>

      <main className="app__main">
        <Routes>
          <Route
            path="/"
            element={
              <NostrFeed
                ndk={ndk}
                relayUrls={FEED_RELAYS}
                filter={{ kinds: [30023], limit: 30 }}
                limit={50}
              />
            }
          />
          <Route
            path="/viewer"
            element={
              <NostrEventViewer
                ndk={ndk}
                mode="single"
                relayUrls={["wss://relay.primal.net"]}
              />
            }
          />
          <Route path="/profile" element={<NostrProfile ndk={ndk} />} />
          <Route path="/profile/:pubkey" element={<NostrProfile ndk={ndk} />} />

          <Route path="/favourites" element={<NostrFavourites ndk={ndk} />} />
          <Route path="/following" element={<NostrFollowing ndk={ndk} />} />
        </Routes>
      </main>

      {showScrollTop && (
        <button
          type="button"
          className="app__scroll-top"
          aria-label="Scroll to top"
          title="Scroll to top"
          onClick={scrollToTop}
        >
          ↑
        </button>
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
export { AppLayout };

import { useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { connectNDK, getNDK } from "./ndk";
import NostrFeed from "./NostrFeed";
import NostrEventViewer from "./NostrEventViewer";
import NostrFavourites from "./NostrFavourites";
import NostrFollowing from "./NostrFollowing";
import NostrProfile from "./NostrProfile";
import "./App.css";

// Relay set used for the live feed and the shared NDK instance. App is the
// single owner of the NDK instance; every other component receives it via
// the `ndk` prop instead of importing the ndk module.
const FEED_RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.damus.io",
];

const ndk = getNDK({ explicitRelayUrls: FEED_RELAYS });

function AppLayout() {
  // Connect the shared NDK instance once when the app mounts. connectNDK
  // reuses the instance created above; failures are logged by the ndk module,
  // and the catch here just prevents an unhandled promise rejection.
  useEffect(() => {
    let cancelled = false;
    connectNDK({ explicitRelayUrls: FEED_RELAYS }).catch((err) => {
      if (!cancelled) console.error("Failed to connect shared NDK:", err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
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
                showMeta={true}
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
          <Route path="/following" element={<NostrFollowing />} />
        </Routes>
      </main>
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

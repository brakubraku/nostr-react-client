import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import NostrFeed from "./NostrFeed";
import NostrEventViewer from "./NostrEventViewer";
import NostrFavourites from "./NostrFavourites";
import NostrProfile from "./NostrProfile";
import "./App.css";

function AppLayout() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Nostr Events</h1>
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
        </nav>
      </header>

      <main className="app__main">
        <Routes>
          <Route
            path="/"
            element={
              <NostrFeed
                relayUrls={[
                  "wss://relay.primal.net",
                  "wss://nos.lol",
                  "wss://relay.damus.io",
                ]}
                filter={{ kinds: [1], limit: 30 }}
                limit={50}
                showMeta={true}
              />
            }
          />
          <Route
            path="/viewer"
            element={
              <NostrEventViewer
                mode="single"
                relayUrls={["wss://relay.primal.net"]}
              />
            }
          />
          <Route path="/profile" element={<NostrProfile />} />
          <Route path="/profile/:pubkey" element={<NostrProfile />} />

          <Route path="/favourites" element={<NostrFavourites />} />
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

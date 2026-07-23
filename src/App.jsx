import { useState } from "react";
import NostrFeed from "./NostrFeed";
import NostrEventViewer from "./NostrEventViewer";
import NostrFavourites from "./NostrFavourites";
import "./App.css";

function App() {
  const [viewMode, setViewMode] = useState("feed");

  return (
    <div className="app">
      <header className="app__header">
        <h1>Nostr Events</h1>
        <nav className="app__nav">
          <button
            className={`app__nav-btn ${viewMode === "feed" ? "app__nav-btn--active" : ""}`}
            onClick={() => setViewMode("feed")}
          >
            Live Feed
          </button>
          <button
            className={`app__nav-btn ${viewMode === "viewer" ? "app__nav-btn--active" : ""}`}
            onClick={() => setViewMode("viewer")}
          >
            Event Lookup
          </button>
          <button
            className={`app__nav-btn ${viewMode === "favourites" ? "app__nav-btn--active" : ""}`}
            onClick={() => setViewMode("favourites")}
          >
            ⭐ Favourites
          </button>
        </nav>
      </header>

      <main className="app__main">
        {viewMode === "feed" && (
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
        )}

        {viewMode === "viewer" && (
          <NostrEventViewer
            mode="single"
            relayUrls={["wss://relay.primal.net"]}
          />
        )}

        {viewMode === "favourites" && <NostrFavourites />}
      </main>
    </div>
  );
}

export default App;

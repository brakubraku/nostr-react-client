import { useState, useEffect } from "react";
import { getNDK } from "./ndk";
import NostrEventCard from "./NostrEventCard";

/**
 * NostrFavourites — displays saved favourite Nostr events from localStorage.
 *
 * Props:
 *   onNavigateToProfile - Callback for navigating to a user's profile
 *
 * Readers can remove events from favourites by clicking the heart button
 * on each NostrEventCard, or clear all favourites with the clear button.
 */
export default function NostrFavourites({ onNavigateToProfile }) {
  const [favourites, setFavourites] = useState([]);
  const ndk = getNDK();

  // Load favourites from localStorage on mount and when storage changes
  useEffect(() => {
    function loadFavourites() {
      try {
        const stored = localStorage.getItem("nostr-favorites");
        setFavourites(stored ? JSON.parse(stored) : []);
      } catch {
        setFavourites([]);
      }
    }

    loadFavourites();

    // Re-read favourites when storage is changed from another tab
    window.addEventListener("storage", loadFavourites);
    // Re-read favourites when a favourite is toggled in the same tab
    window.addEventListener("nostr-favorites-changed", loadFavourites);
    return () => {
      window.removeEventListener("storage", loadFavourites);
      window.removeEventListener("nostr-favorites-changed", loadFavourites);
    };
  }, []);

  /**
   * Remove all favourites.
   */
  function clearAll() {
    localStorage.removeItem("nostr-favorites");
    setFavourites([]);
  }

  return (
    <div className="nostr-favourites">
      <div className="nostr-favourites__header">
        <h2 className="nostr-favourites__title">Favourites</h2>
        {favourites.length > 0 && (
          <button className="nostr-favourites__clear-btn" onClick={clearAll}>
            Clear All
          </button>
        )}
      </div>

      {favourites.length === 0 ? (
        <div className="nostr-favourites__empty">
          <p>No favourite events yet.</p>
          <p className="nostr-favourites__hint">
            Browse the Live Feed and click the <strong>+</strong> button on any
            event to add it here.
          </p>
        </div>
      ) : (
        <div className="nostr-favourites__list">
          {favourites.map((event) => (
            <NostrEventCard
              event={event}
              showMeta={true}
              confirmUnfav={true}
              onNavigateToProfile={onNavigateToProfile}
            />
          ))}
        </div>
      )}

      {favourites.length > 0 && (
        <div className="nostr-favourites__footer">
          <span className="nostr-favourites__count">
            {favourites.length} favourite{favourites.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

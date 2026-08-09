import { useState, useEffect } from "react";
import { getFavourites, clearFavourites } from "./favourites";
import NostrEventCard from "./NostrEventCard";

/**
 * NostrFavourites — displays saved favourite Nostr events from localStorage.
 *
 * Readers can remove events from favourites by clicking the heart button
 * on each NostrEventCard, or clear all favourites with the clear button.
 *
 * Props:
 *   ndk - Shared NDK instance (provided by App), forwarded to NostrEventCard
 */
export default function NostrFavourites({ ndk }) {
  const [favourites, setFavourites] = useState([]);

  useEffect(() => {
    function loadFavourites() {
      setFavourites(getFavourites());
    }

    // Load immediately
    loadFavourites();

    // Subscribe to the observable (react to changes within the same tab)
    const unsubscribe = getFavourites.subscribe(loadFavourites);

    // Also listen for changes from other tabs (localStorage sync)
    window.addEventListener("storage", loadFavourites);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", loadFavourites);
    };
  }, []);

  /**
   * Remove all favourites via the module.
   */
  function clearAll() {
    clearFavourites();
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
              key={event.id}
              event={event}
              showMeta={true}
              confirmUnfav={true}
              ndk={ndk}
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

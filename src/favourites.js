const STORAGE_KEY = "nostr-favourites";

let favourites = [];

// Observable subscribers
const subscribers = new Set();

/**
 * Load favourites from localStorage into memory.
 * Called once on module load to initialize the singleton.
 */
function loadFavourites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        favourites = parsed;
      } else {
        console.warn("favourites: stored data is not an array, resetting");
        favourites = [];
      }
    }
  } catch (err) {
    console.error("favourites: failed to load from localStorage", err);
    favourites = [];
  }
}

function notifySubscribers() {
  const value = getFavourites();
  for (const cb of subscribers) {
    cb(value);
  }
}

/**
 * Persist the current favourites array to localStorage and notify
 * subscribers (observers registered via getFavourites.subscribe).
 */
function saveFavourites() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favourites));
    notifySubscribers();
  } catch (err) {
    console.error("favourites: failed to save to localStorage", err);
  }
}

// Initialize on module load
loadFavourites();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get the current list of favorite event objects (a shallow copy).
 * This function is also an observable – subscribe to react to changes.
 *
 * @returns {Array<{id: string, kind?: number, pubkey?: string, content?: string, created_at?: number, tags?: string[][]}>}
 */
export function getFavourites() {
  return [...favourites];
}

/**
 * Subscribe to changes to the favourites list.
 * The callback receives the updated favourites array each time a change occurs.
 * Returns an unsubscribe function.
 *
 * @param {(favourites: Array) => void} callback
 * @returns {() => void} unsubscribe
 */
getFavourites.subscribe = function (callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
};
/**
 * Check if an event (by its id) is already in the favourites list.
 * @param {string} eventId
 * @returns {boolean}
 */
export function isFavorite(eventId) {
  return favourites.some((fav) => fav.id === eventId);
}

/**
 * Add an event to favourites. If already present, does nothing.
 * Persists to localStorage after change.
 * @param {{ id: string, kind?: number, pubkey?: string, content?: string, created_at?: number, tags?: string[][] }} eventData
 * @returns {boolean} whether the event was added (true) or already existed (false)
 */
export function addFavorite(eventData) {
  if (favourites.some((fav) => fav.id === eventData.id)) {
    return false;
  }
  favourites.unshift(eventData);
  saveFavourites();
  return true;
}

/**
 * Remove an event from favourites by its id. If not present, does nothing.
 * Persists to localStorage after change.
 * @param {string} eventId
 * @returns {boolean} whether the event was removed (true) or not found (false)
 */
export function removeFavorite(eventId) {
  const index = favourites.findIndex((fav) => fav.id === eventId);
  if (index === -1) {
    return false;
  }
  favourites.splice(index, 1);
  saveFavourites();
  return true;
}

/**
 * Toggle favorite status for an event.
 * @param {{ id: string, kind?: number, pubkey?: string, content?: string, created_at?: number, tags?: string[][] }} eventData
 * @returns {boolean} the new favorite state (true = now favorite, false = now not)
 */
export function toggleFavorite(eventData) {
  if (isFavorite(eventData.id)) {
    removeFavorite(eventData.id);
    return false;
  } else {
    addFavorite(eventData);
    return true;
  }
}

/**
 * Remove all favourites.
 * Persists to localStorage after change.
 */
export function clearFavourites() {
  if (favourites.length === 0) return;
  favourites = [];
  saveFavourites();
}

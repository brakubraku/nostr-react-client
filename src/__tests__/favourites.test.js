import { describe, it, expect, beforeEach } from "vitest";

// We mock localStorage in setupTests.js but need to import the module fresh
// for each test to get a clean state.
// The module uses localStorage internally.

describe("favourites module", () => {
  let favouritesModule;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset modules so the module-level loadFavourites re-reads localStorage
    vi.resetModules();
    favouritesModule = await import("../favourites");
  });

  describe("getFavourites", () => {
    it("should return an empty array when no favourites exist", () => {
      const result = favouritesModule.getFavourites();
      expect(result).toEqual([]);
    });
  });

  describe("addFavorite", () => {
    it("should add an event to favourites", () => {
      const event = {
        id: "event1",
        kind: 1,
        pubkey: "abc123",
        content: "Hello Nostr!",
        created_at: 1000000,
        tags: [],
      };

      const added = favouritesModule.addFavorite(event);
      expect(added).toBe(true);

      const favourites = favouritesModule.getFavourites();
      expect(favourites).toHaveLength(1);
      expect(favourites[0]).toMatchObject(event);
    });

    it("should return false if the event already exists", () => {
      const event = {
        id: "event1",
        kind: 1,
        pubkey: "abc123",
        content: "Hello Nostr!",
        created_at: 1000000,
        tags: [],
      };

      favouritesModule.addFavorite(event);
      const addedAgain = favouritesModule.addFavorite(event);
      expect(addedAgain).toBe(false);

      const favourites = favouritesModule.getFavourites();
      expect(favourites).toHaveLength(1);
    });

    it("should add new events to the beginning of the list", () => {
      const event1 = { id: "e1", content: "first" };
      const event2 = { id: "e2", content: "second" };

      favouritesModule.addFavorite(event1);
      favouritesModule.addFavorite(event2);

      const favourites = favouritesModule.getFavourites();
      expect(favourites[0].id).toBe("e2");
      expect(favourites[1].id).toBe("e1");
    });
  });

  describe("isFavorite", () => {
    it("should return true for an event that is a favourite", () => {
      favouritesModule.addFavorite({ id: "event1" });
      expect(favouritesModule.isFavorite("event1")).toBe(true);
    });

    it("should return false for an event that is not a favourite", () => {
      expect(favouritesModule.isFavorite("nonexistent")).toBe(false);
    });
  });

  describe("removeFavorite", () => {
    it("should remove an event from favourites", () => {
      const event = { id: "event1" };
      favouritesModule.addFavorite(event);

      const removed = favouritesModule.removeFavorite("event1");
      expect(removed).toBe(true);

      const favourites = favouritesModule.getFavourites();
      expect(favourites).toHaveLength(0);
    });

    it("should return false if the event is not found", () => {
      const removed = favouritesModule.removeFavorite("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("toggleFavorite", () => {
    it("should add an event if it is not already a favourite", () => {
      const event = { id: "event1" };
      const nowFav = favouritesModule.toggleFavorite(event);
      expect(nowFav).toBe(true);
      expect(favouritesModule.isFavorite("event1")).toBe(true);
    });

    it("should remove an event if it is already a favourite", () => {
      const event = { id: "event1" };
      favouritesModule.addFavorite(event);

      const nowFav = favouritesModule.toggleFavorite(event);
      expect(nowFav).toBe(false);
      expect(favouritesModule.isFavorite("event1")).toBe(false);
    });
  });

  describe("clearFavourites", () => {
    it("should remove all favourites", () => {
      favouritesModule.addFavorite({ id: "e1" });
      favouritesModule.addFavorite({ id: "e2" });

      favouritesModule.clearFavourites();

      const favourites = favouritesModule.getFavourites();
      expect(favourites).toHaveLength(0);
    });

    it("should do nothing if already empty", () => {
      favouritesModule.clearFavourites();
      const favourites = favouritesModule.getFavourites();
      expect(favourites).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("should persist favourites to localStorage", () => {
      const event = {
        id: "e1",
        kind: 1,
        pubkey: "pk",
        content: "test",
        created_at: 1000,
        tags: [],
      };
      favouritesModule.addFavorite(event);

      // Check that localStorage was written
      const stored = JSON.parse(localStorage.getItem("nostr-favourites"));
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("e1");
    });

    it("should load favourites from localStorage on module init", async () => {
      // Manually set localStorage
      const events = [
        { id: "e1", content: "stored1" },
        { id: "e2", content: "stored2" },
      ];
      localStorage.setItem("nostr-favourites", JSON.stringify(events));

      // Re-import to trigger loadFavourites
      vi.resetModules();
      const mod = await import("../favourites");

      const loaded = mod.getFavourites();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe("e1");
    });
  });

  describe("observable pattern (subscribe)", () => {
    it("should notify subscribers when favourites change", () => {
      const callback = vi.fn();
      const unsubscribe = favouritesModule.getFavourites.subscribe(callback);

      favouritesModule.addFavorite({ id: "e1" });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: "e1" })]);

      favouritesModule.addFavorite({ id: "e2" });
      expect(callback).toHaveBeenCalledTimes(2);

      // Clean up
      unsubscribe();
    });

    it("should stop notifying after unsubscribe", () => {
      const callback = vi.fn();
      const unsubscribe = favouritesModule.getFavourites.subscribe(callback);

      favouritesModule.addFavorite({ id: "e1" });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      favouritesModule.addFavorite({ id: "e2" });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
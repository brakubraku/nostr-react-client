import { describe, it, expect, beforeEach } from "vitest";

// We mock localStorage in setupTests.js but need to import the module fresh
// for each test to get a clean state.
// The module uses localStorage internally.

describe("follows module", () => {
  let followsModule;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset modules so the module-level loadFollows re-reads localStorage
    vi.resetModules();
    followsModule = await import("../follows");
  });

  describe("getFollows", () => {
    it("should return an empty array when no accounts are followed", () => {
      const result = followsModule.getFollows();
      expect(result).toEqual([]);
    });
  });

  describe("addFollow", () => {
    it("should add an account to follows", () => {
      const account = {
        pubkey: "abc123",
        name: "alice",
        displayName: "Alice",
        picture: "https://example.com/alice.png",
        nip05: "alice@example.com",
      };

      const added = followsModule.addFollow(account);
      expect(added).toBe(true);

      const follows = followsModule.getFollows();
      expect(follows).toHaveLength(1);
      expect(follows[0]).toMatchObject(account);
    });

    it("should return false if the account already exists", () => {
      const account = { pubkey: "abc123", name: "alice" };

      followsModule.addFollow(account);
      const addedAgain = followsModule.addFollow(account);
      expect(addedAgain).toBe(false);

      const follows = followsModule.getFollows();
      expect(follows).toHaveLength(1);
    });

    it("should add new accounts to the beginning of the list", () => {
      const account1 = { pubkey: "pk1", name: "first" };
      const account2 = { pubkey: "pk2", name: "second" };

      followsModule.addFollow(account1);
      followsModule.addFollow(account2);

      const follows = followsModule.getFollows();
      expect(follows[0].pubkey).toBe("pk2");
      expect(follows[1].pubkey).toBe("pk1");
    });

    it("should reject accounts without a pubkey", () => {
      const added = followsModule.addFollow({ name: "no pubkey" });
      expect(added).toBe(false);

      const follows = followsModule.getFollows();
      expect(follows).toHaveLength(0);
    });
  });

  describe("isFollowing", () => {
    it("should return true for an account that is followed", () => {
      followsModule.addFollow({ pubkey: "abc123" });
      expect(followsModule.isFollowing("abc123")).toBe(true);
    });

    it("should return false for an account that is not followed", () => {
      expect(followsModule.isFollowing("nonexistent")).toBe(false);
    });
  });

  describe("removeFollow", () => {
    it("should remove an account from follows", () => {
      const account = { pubkey: "abc123" };
      followsModule.addFollow(account);

      const removed = followsModule.removeFollow("abc123");
      expect(removed).toBe(true);

      const follows = followsModule.getFollows();
      expect(follows).toHaveLength(0);
    });

    it("should return false if the account is not found", () => {
      const removed = followsModule.removeFollow("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("toggleFollow", () => {
    it("should add an account if it is not already followed", () => {
      const account = { pubkey: "abc123" };
      const nowFollowing = followsModule.toggleFollow(account);
      expect(nowFollowing).toBe(true);
      expect(followsModule.isFollowing("abc123")).toBe(true);
    });

    it("should remove an account if it is already followed", () => {
      const account = { pubkey: "abc123" };
      followsModule.addFollow(account);

      const nowFollowing = followsModule.toggleFollow(account);
      expect(nowFollowing).toBe(false);
      expect(followsModule.isFollowing("abc123")).toBe(false);
    });

    it("should return false for accounts without a pubkey", () => {
      const nowFollowing = followsModule.toggleFollow({ name: "no pubkey" });
      expect(nowFollowing).toBe(false);
    });
  });

  describe("clearFollows", () => {
    it("should remove all followed accounts", () => {
      followsModule.addFollow({ pubkey: "pk1" });
      followsModule.addFollow({ pubkey: "pk2" });

      followsModule.clearFollows();

      const follows = followsModule.getFollows();
      expect(follows).toHaveLength(0);
    });

    it("should do nothing if already empty", () => {
      followsModule.clearFollows();
      const follows = followsModule.getFollows();
      expect(follows).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("should persist follows to localStorage", () => {
      const account = {
        pubkey: "pk1",
        name: "alice",
        displayName: "Alice",
      };
      followsModule.addFollow(account);

      // Check that localStorage was written
      const stored = JSON.parse(localStorage.getItem("nostr-follows"));
      expect(stored).toHaveLength(1);
      expect(stored[0].pubkey).toBe("pk1");
    });

    it("should load follows from localStorage on module init", async () => {
      // Manually set localStorage
      const accounts = [
        { pubkey: "pk1", name: "stored1" },
        { pubkey: "pk2", name: "stored2" },
      ];
      localStorage.setItem("nostr-follows", JSON.stringify(accounts));

      // Re-import to trigger loadFollows
      vi.resetModules();
      const mod = await import("../follows");

      const loaded = mod.getFollows();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].pubkey).toBe("pk1");
    });
  });

  describe("observable pattern (subscribe)", () => {
    it("should notify subscribers when follows change", () => {
      const callback = vi.fn();
      const unsubscribe = followsModule.getFollows.subscribe(callback);

      followsModule.addFollow({ pubkey: "pk1" });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([
        expect.objectContaining({ pubkey: "pk1" }),
      ]);

      followsModule.addFollow({ pubkey: "pk2" });
      expect(callback).toHaveBeenCalledTimes(2);

      // Clean up
      unsubscribe();
    });

    it("should stop notifying after unsubscribe", () => {
      const callback = vi.fn();
      const unsubscribe = followsModule.getFollows.subscribe(callback);

      followsModule.addFollow({ pubkey: "pk1" });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      followsModule.addFollow({ pubkey: "pk2" });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});

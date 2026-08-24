import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import ReplySidePanel from "../ReplySidePanel";
import { eventIsReply } from "@nostr-dev-kit/ndk";

// Mock the ndk package so the replies/reactions subscription doesn't load the
// full library in tests and stays deterministic.
vi.mock("@nostr-dev-kit/ndk", () => {
  class NDKEvent {
    constructor(ndk, event = {}) {
      this.ndk = ndk;
      Object.assign(this, event);
    }
  }
  return {
    NDKEvent,
    eventIsReply: vi.fn(),
  };
});

const subscribeMock = vi.fn();
// Mock NDK instance passed via props
const mockNdk = { subscribe: subscribeMock };

const mainEvent = {
  id: "mainEventId123",
  kind: 1,
  pubkey: "mainpubkey1234567890123456789012345678901234567890",
  content: "Main event",
  created_at: Math.floor(Date.now() / 1000) - 3600,
  tags: [],
};

function makeReply(id) {
  return {
    id,
    kind: 1,
    pubkey: "replypubkey1234567890123456789012345678901234567890",
    content: "A reply",
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", mainEvent.id, "", "reply"]],
  };
}

function makeReaction(id) {
  return {
    id,
    kind: 7,
    pubkey: "reactionpubkey1234567890123456789012345678901234567890",
    content: "❤️",
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", mainEvent.id],
      ["p", mainEvent.pubkey],
    ],
  };
}

function renderPanel({
  onRepliesChange = vi.fn(),
  onReactionsChange = vi.fn(),
} = {}) {
  return render(
    <ReplySidePanel
      event={mainEvent}
      ndk={mockNdk}
      onRepliesChange={onRepliesChange}
      onReactionsChange={onReactionsChange}
    />,
  );
}

describe("ReplySidePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => ({ stop: vi.fn() }));
    // Default: treat everything that isn't a reaction as a reply, so callers
    // can override per-test when checking the reply discrimination.
    vi.mocked(eventIsReply).mockImplementation((op, event) => event.kind !== 7);
  });

  it("shows separate reply and reaction counts", async () => {
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReply("reply1"));
      opts.onEvent(makeReaction("react1"));
      return { stop: vi.fn() };
    });

    const { container } = renderPanel();

    await waitFor(() => {
      expect(
        container.querySelector(".nostr-thread__reply-count")?.textContent,
      ).toContain("1");
      expect(
        container.querySelector(".nostr-thread__reaction-count")?.textContent,
      ).toContain("1");
    });
    expect(
      container.querySelector(".nostr-thread__reply-label")?.textContent,
    ).toBe("reply");
    expect(
      container.querySelector(".nostr-thread__reaction-label")?.textContent,
    ).toBe("reaction");
  });

  it("pluralises the labels when there are multiple replies/reactions", async () => {
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReply("reply1"));
      opts.onEvent(makeReply("reply2"));
      opts.onEvent(makeReaction("react1"));
      opts.onEvent(makeReaction("react2"));
      return { stop: vi.fn() };
    });

    const { container } = renderPanel();

    await waitFor(() => {
      expect(
        container.querySelector(".nostr-thread__reply-count")?.textContent,
      ).toContain("2");
      expect(
        container.querySelector(".nostr-thread__reaction-count")?.textContent,
      ).toContain("2");
    });
    expect(
      container.querySelector(".nostr-thread__reply-label")?.textContent,
    ).toBe("replies");
    expect(
      container.querySelector(".nostr-thread__reaction-label")?.textContent,
    ).toBe("reactions");
  });

  it("calls onRepliesChange with replies and onReactionsChange with reactions", async () => {
    const onRepliesChange = vi.fn();
    const onReactionsChange = vi.fn();
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReply("reply1"));
      opts.onEvent(makeReaction("react1"));
      return { stop: vi.fn() };
    });

    renderPanel({ onRepliesChange, onReactionsChange });

    await waitFor(() => {
      expect(onRepliesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: "reply1" }),
      ]);
      expect(onReactionsChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: "react1" }),
      ]);
    });
  });

  it("drops events that are neither replies nor reactions", async () => {
    const onRepliesChange = vi.fn();
    const onReactionsChange = vi.fn();
    vi.mocked(eventIsReply).mockReturnValue(false);
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent({ ...makeReply("repost1"), kind: 6 }); // repost
      return { stop: vi.fn() };
    });

    renderPanel({ onRepliesChange, onReactionsChange });

    await waitFor(() => {
      expect(onRepliesChange).toHaveBeenCalledWith([]);
      expect(onReactionsChange).toHaveBeenCalledWith([]);
    });
  });

  it("does not count duplicate events twice", async () => {
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReaction("react1"));
      opts.onEvent(makeReaction("react1"));
      return { stop: vi.fn() };
    });

    const { container } = renderPanel();

    await waitFor(() => {
      expect(
        container.querySelector(".nostr-thread__reaction-count")?.textContent,
      ).toContain("1");
    });
  });
});

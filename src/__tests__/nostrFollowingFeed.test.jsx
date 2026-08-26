import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import NostrFollowingFeed from "../NostrFollowingFeed";

// Mock the ndk package so the thread's parent fetch, replies subscription,
// and nip19 helpers stay deterministic without loading the full library.
vi.mock("@nostr-dev-kit/ndk", () => {
  class NDKEvent {
    constructor(ndk, event = {}) {
      this.ndk = ndk;
      Object.assign(this, event);
    }
    fetchReplyEvent() {
      return Promise.resolve(null);
    }
  }
  return {
    NDKEvent,
    eventIsReply: vi.fn(() => true),
    nip19: { decode: vi.fn() },
  };
});

// Hoisted mocks: a fake NDK instance plus a controllable follows store so we
// can inspect the filters passed to subscribe and trigger follows changes.
const mocks = vi.hoisted(() => {
  const followsSubscribers = new Set();
  let currentFollows = [];

  const getFollows = vi.fn(() => [...currentFollows]);
  getFollows.subscribe = vi.fn((callback) => {
    followsSubscribers.add(callback);
    return () => {
      followsSubscribers.delete(callback);
    };
  });

  return {
    ndk: {
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => ({ stop: vi.fn() })),
    },
    getFollows,
    /** Replace the follows list and notify the observable subscribers. */
    setFollows(list) {
      currentFollows = [...list];
      followsSubscribers.forEach((callback) => callback([...currentFollows]));
    },
  };
});

vi.mock("../follows", () => ({
  getFollows: mocks.getFollows,
}));

const FOLLOW_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FOLLOW_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function renderFeed(props = {}) {
  return render(
    <BrowserRouter>
      <NostrFollowingFeed ndk={mocks.ndk} {...props} />
    </BrowserRouter>,
  );
}

describe("NostrFollowingFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setFollows([]);
    mocks.ndk.subscribe.mockImplementation(() => ({ stop: vi.fn() }));
  });

  it("shows an empty state and does not subscribe without followed accounts", () => {
    renderFeed();
    expect(
      screen.getByText("You're not following any accounts yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("No follows")).toBeInTheDocument();
    expect(mocks.ndk.subscribe).not.toHaveBeenCalled();
    expect(mocks.ndk.connect).not.toHaveBeenCalled();
  });

  it("subscribes with an authors filter for the followed pubkeys", async () => {
    mocks.setFollows([{ pubkey: FOLLOW_A }, { pubkey: FOLLOW_B }]);
    renderFeed();

    await waitFor(() => expect(mocks.ndk.subscribe).toHaveBeenCalled());

    const filter = mocks.ndk.subscribe.mock.calls.at(-1)[0];
    expect(filter.kinds).toEqual([30023]);
    expect(filter.authors).toEqual([FOLLOW_A, FOLLOW_B]);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("re-subscribes with the updated authors when the follows list changes", async () => {
    mocks.setFollows([{ pubkey: FOLLOW_A }]);
    renderFeed();

    await waitFor(() => {
      expect(mocks.ndk.subscribe.mock.calls.at(-1)[0].authors).toEqual([
        FOLLOW_A,
      ]);
    });
    const firstSub = mocks.ndk.subscribe.mock.results.at(-1).value;

    mocks.setFollows([{ pubkey: FOLLOW_A }, { pubkey: FOLLOW_B }]);

    await waitFor(() => {
      expect(mocks.ndk.subscribe.mock.calls.at(-1)[0].authors).toEqual([
        FOLLOW_A,
        FOLLOW_B,
      ]);
    });
    expect(firstSub.stop).toHaveBeenCalled();
  });

  it("stops subscribing and clears events when all follows are removed", async () => {
    mocks.setFollows([{ pubkey: FOLLOW_A }]);
    renderFeed();

    await waitFor(() => expect(mocks.ndk.subscribe).toHaveBeenCalled());
    const firstSub = mocks.ndk.subscribe.mock.results.at(-1).value;

    mocks.setFollows([]);

    await waitFor(() => {
      expect(
        screen.getByText("You're not following any accounts yet."),
      ).toBeInTheDocument();
    });
    expect(firstSub.stop).toHaveBeenCalled();
    expect(screen.getByText("No follows")).toBeInTheDocument();
  });

  it("re-subscribes with text notes (kind 1) when the content type changes", async () => {
    mocks.setFollows([{ pubkey: FOLLOW_A }]);
    renderFeed();

    await waitFor(() => expect(mocks.ndk.subscribe).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "notes" },
    });

    await waitFor(() => {
      expect(mocks.ndk.subscribe.mock.calls.at(-1)[0].kinds).toEqual([1]);
    });
    expect(mocks.ndk.subscribe.mock.calls.at(-1)[0].authors).toEqual([
      FOLLOW_A,
    ]);
  });

  it("renders events delivered from followed authors", async () => {
    mocks.setFollows([{ pubkey: FOLLOW_A }]);
    mocks.ndk.subscribe.mockImplementation((filter, opts) => {
      opts.onEvent({
        id: "evt1",
        kind: 30023,
        pubkey: FOLLOW_A,
        content: "Hello from a followed author",
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
      });
      return { stop: vi.fn() };
    });

    renderFeed();

    expect(
      await screen.findByText("Hello from a followed author"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });
});

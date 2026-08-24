import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
const getUserMock = vi.fn();
// Mock NDK instance passed via props
const mockNdk = { subscribe: subscribeMock, getUser: getUserMock };

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

function makeReaction(
  id,
  content = "❤️",
  pubkey = "reactionpubkey1234567890123456789012345678901234567890",
) {
  return {
    id,
    kind: 7,
    pubkey,
    content,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", mainEvent.id],
      ["p", mainEvent.pubkey],
    ],
  };
}

function makeUser(pubkey, profile = {}) {
  return {
    pubkey,
    profile,
    fetchProfile: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPanel({
  onRepliesChange = vi.fn(),
  onReactionsChange = vi.fn(),
} = {}) {
  return render(
    <MemoryRouter>
      <ReplySidePanel
        event={mainEvent}
        ndk={mockNdk}
        onRepliesChange={onRepliesChange}
        onReactionsChange={onReactionsChange}
      />
    </MemoryRouter>,
  );
}

describe("ReplySidePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => ({ stop: vi.fn() }));
    getUserMock.mockReset();
    getUserMock.mockImplementation(({ pubkey }) => makeUser(pubkey));
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

  it("opens a modal grouped by reaction and shows the reacting profiles", async () => {
    const alice = "reactionpubkeyaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const bob = "reactionpubkeybbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const carol = "reactionpubkeyccccccccccccccccccccccccccccccccccccccc";
    const profilesByPubkey = {
      [alice]: { name: "Alice", picture: "https://example.com/alice.png" },
      [bob]: { displayName: "Bobby" },
      [carol]: { name: "Carol" },
    };
    getUserMock.mockImplementation(({ pubkey }) =>
      makeUser(pubkey, profilesByPubkey[pubkey]),
    );

    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReaction("react1", "❤️", alice));
      opts.onEvent(makeReaction("react2", "👍", bob));
      opts.onEvent(makeReaction("react3", "❤️", carol));
      return { stop: vi.fn() };
    });

    const { container } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /reaction/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Reactions" }),
      ).toBeInTheDocument();
    });

    // Grouped by emoji, with per-group counts.
    const groups = container.querySelectorAll(".nostr-thread__reaction-group");
    expect(groups.length).toBe(2);

    expect(
      groups[0].querySelector(".nostr-thread__reaction-group-emoji")
        .textContent,
    ).toBe("❤️");
    expect(
      groups[0].querySelector(".nostr-thread__reaction-group-count")
        .textContent,
    ).toBe("2");
    expect(groups[0].textContent).toContain("Alice");
    expect(groups[0].textContent).toContain("Carol");

    expect(
      groups[1].querySelector(".nostr-thread__reaction-group-emoji")
        .textContent,
    ).toBe("👍");
    expect(
      groups[1].querySelector(".nostr-thread__reaction-group-count")
        .textContent,
    ).toBe("1");
    expect(groups[1].textContent).toContain("Bobby");

    // Profiles were fetched for each reactor.
    await waitFor(() => {
      expect(getUserMock).toHaveBeenCalledWith({ pubkey: alice });
      expect(getUserMock).toHaveBeenCalledWith({ pubkey: bob });
      expect(getUserMock).toHaveBeenCalledWith({ pubkey: carol });
    });
  });

  it("treats a '+' reaction as a thumbs up", async () => {
    const alice = "reactionpubkeyaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const bob = "reactionpubkeybbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    getUserMock.mockImplementation(({ pubkey }) =>
      makeUser(pubkey, { name: pubkey === alice ? "Alice" : "Bobby" }),
    );

    subscribeMock.mockImplementation((filter, opts) => {
      // A "+" upvote and a literal "👍" should merge into the same group.
      opts.onEvent(makeReaction("react1", "+", alice));
      opts.onEvent(makeReaction("react2", "👍", bob));
      return { stop: vi.fn() };
    });

    const { container } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /reaction/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Reactions" }),
      ).toBeInTheDocument();
    });

    const groups = container.querySelectorAll(".nostr-thread__reaction-group");
    expect(groups.length).toBe(1);
    expect(
      groups[0].querySelector(".nostr-thread__reaction-group-emoji")
        .textContent,
    ).toBe("👍");
    expect(
      groups[0].querySelector(".nostr-thread__reaction-group-count")
        .textContent,
    ).toBe("2");
    expect(groups[0].textContent).toContain("Alice");
    expect(groups[0].textContent).toContain("Bobby");
  });

  it("closes the reactions modal when the close button is clicked", async () => {
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReaction("react1"));
      return { stop: vi.fn() };
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /reaction/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Reactions" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close reactions" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Reactions" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows an empty state when there are no reactions", async () => {
    subscribeMock.mockImplementation(() => ({ stop: vi.fn() }));

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /reaction/i }));

    await waitFor(() => {
      expect(screen.getByText("No reactions yet.")).toBeInTheDocument();
    });
  });

  it("does not re-fetch profiles when the modal is reopened", async () => {
    const alice = "reactionpubkeyaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    getUserMock.mockImplementation(({ pubkey }) =>
      makeUser(pubkey, { name: "Alice" }),
    );
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReaction("react1", "❤️", alice));
      return { stop: vi.fn() };
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /reaction/i }));
    await waitFor(() => expect(getUserMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Close reactions" }));
    fireEvent.click(screen.getByRole("button", { name: /reaction/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Reactions" }),
      ).toBeInTheDocument();
    });

    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it("routes to the profile view when a reactor is clicked", async () => {
    const alice = "reactionpubkeyaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    getUserMock.mockImplementation(({ pubkey }) =>
      makeUser(pubkey, { name: "Alice" }),
    );
    subscribeMock.mockImplementation((filter, opts) => {
      opts.onEvent(makeReaction("react1", "❤️", alice));
      return { stop: vi.fn() };
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={<ReplySidePanel event={mainEvent} ndk={mockNdk} />}
          />
          <Route path="/profile/:pubkey" element={<div>PROFILE PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /reaction/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Reactions" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /alice/i }));

    await waitFor(() => {
      expect(screen.getByText("PROFILE PAGE")).toBeInTheDocument();
    });
  });
});

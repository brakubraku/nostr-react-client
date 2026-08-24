import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Thread from "../Thread";

// Mock the ndk package so the thread's parent fetch and replies subscription
// don't load the full library in tests and stay deterministic.
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
  };
});

const subscribeMock = vi.fn();
// Mock NDK instance passed via props (author metadata fetch)
const mockNdk = {
  getUser: vi.fn(() => ({
    fetchProfile: vi.fn().mockResolvedValue(undefined),
    profile: {},
  })),
  subscribe: subscribeMock,
};

function renderThread(event, ndk = mockNdk) {
  return render(
    <BrowserRouter>
      <Thread event={event} ndk={ndk} />
    </BrowserRouter>,
  );
}

const mainEvent = {
  id: "mainEventId123",
  kind: 1,
  pubkey: "mainpubkey1234567890123456789012345678901234567890",
  content: "Main event content",
  created_at: Math.floor(Date.now() / 1000) - 3600,
  tags: [],
};

describe("Thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => ({ stop: vi.fn() }));
  });

  it("should render the main event as a NostrEventCard", () => {
    renderThread(mainEvent);
    expect(screen.getByText("Main event content")).toBeInTheDocument();
  });

  it("should show an empty state when no event is provided", () => {
    renderThread(null);
    expect(screen.getByText("No event data")).toBeInTheDocument();
  });

  it("should fetch and render the parent event above the main event", async () => {
    subscribeMock.mockImplementation((filter, opts) => {
      if (filter["#e"]?.[0] === "parentEventId456") {
        opts.onEvent({
          ...mainEvent,
          tags: [["e", "parentEventId456", "", "reply"]],
        });
      }
      return { stop: vi.fn() };
    });
    const eventWithParent = {
      ...mainEvent,
      fetchReplyEvent: vi.fn().mockResolvedValue({
        id: "parentEventId456",
        kind: 1,
        pubkey: "parentpubkey1234567890123456789012345678901234567890",
        content: "Parent event content",
        created_at: Math.floor(Date.now() / 1000) - 7200,
        tags: [],
      }),
    };

    const { container } = render(
      <BrowserRouter>
        <Thread event={eventWithParent} ndk={mockNdk} showParent={true} />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Parent event content")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Main event content")).toBeInTheDocument();
    });

    const cards = container.querySelectorAll(".nostr-card");
    expect(cards[0].textContent).toContain("Parent event content");
    expect(cards[1].textContent).toContain("Main event content");
  });

  it("should show a clickable three-dot indicator when the parent is collapsed and expand it on click", async () => {
    const eventWithParent = {
      ...mainEvent,
      fetchReplyEvent: vi.fn().mockResolvedValue({
        id: "parentEventId456",
        kind: 1,
        pubkey: "parentpubkey1234567890123456789012345678901234567890",
        content: "Parent event content",
        created_at: Math.floor(Date.now() / 1000) - 7200,
        tags: [],
      }),
    };

    render(
      <BrowserRouter>
        <Thread event={eventWithParent} ndk={mockNdk} showParent={false} />
      </BrowserRouter>,
    );

    const expandButton = await screen.findByRole("button", {
      name: "Show parent event",
    });

    expect(screen.queryByText("Parent event content")).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByText("Parent event content")).toBeInTheDocument();
    });
  });

  it("should not render a parent when the event has no reply tag", async () => {
    renderThread(mainEvent);
    // Give the mocked fetch a chance to resolve.
    await Promise.resolve();
    expect(screen.queryByText("Parent event content")).not.toBeInTheDocument();
  });

  it("should subscribe to replies with an e-tag filter", () => {
    renderThread(mainEvent);
    expect(subscribeMock).toHaveBeenCalledWith(
      { "#e": [mainEvent.id] },
      expect.any(Object),
    );
  });

  it("should render replies as NostrEventCards stacked under the main event", async () => {
    subscribeMock.mockImplementation((filter, opts) => {
      if (filter["#e"]?.[0] === mainEvent.id) {
        opts.onEvent({
          id: "replyEventId1",
          kind: 1,
          pubkey: "replypubkey1234567890123456789012345678901234567890",
          content: "Reply one",
          created_at: Math.floor(Date.now() / 1000),
          tags: [["e", mainEvent.id, "", "reply"]],
        });
        opts.onEvent({
          id: "replyEventId2",
          kind: 1,
          pubkey: "replypubkey2234567890123456789012345678901234567890",
          content: "Reply two",
          created_at: Math.floor(Date.now() / 1000),
          tags: [["e", mainEvent.id, "", "reply"]],
        });
      }
      return { stop: vi.fn() };
    });

    const { container } = renderThread(mainEvent);

    fireEvent.click(screen.getByTitle("Expand replies"));

    await waitFor(() => {
      expect(screen.getByText("Reply one")).toBeInTheDocument();
    });

    const cards = container.querySelectorAll(".nostr-card");
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain("Main event content");
    expect(cards[1].textContent).toContain("Reply one");
    expect(cards[2].textContent).toContain("Reply two");
  });

  it("should stop the replies subscription on unmount", () => {
    const { unmount } = renderThread(mainEvent);
    const sub = subscribeMock.mock.results[0].value;
    unmount();
    expect(sub.stop).toHaveBeenCalled();
  });
});

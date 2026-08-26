import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppLayout } from "../App";

// Minimal NDK stub used by the mocked ndk module.
const { mockNdk } = vi.hoisted(() => ({
  mockNdk: {
    connect: vi.fn(async () => {}),
    subscribe: vi.fn(() => ({
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    fetchEvents: vi.fn(async () => new Set()),
    fetchEvent: vi.fn(async () => null),
    getUser: vi.fn(() => ({
      fetchProfile: vi.fn().mockResolvedValue(undefined),
      profile: {},
    })),
  },
}));

vi.mock("../ndk", () => ({
  getNDK: vi.fn(() => mockNdk),
  connectNDK: vi.fn(async () => mockNdk),
  disconnectNDK: vi.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderWithRouter(route) {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <AppLayout />
      </MemoryRouter>,
    );
  }

  it("shows only a spinner until ndk is assigned", async () => {
    const { connectNDK } = await import("../ndk");
    let resolveConnect;
    vi.mocked(connectNDK).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConnect = resolve;
      }),
    );

    const { container } = renderWithRouter("/");

    // While ndk is null, only the spinner is shown
    expect(container.querySelector(".app__spinner")).toBeInTheDocument();
    expect(screen.queryByText("Live Feed")).not.toBeInTheDocument();

    // Once ndk is assigned, the app renders
    resolveConnect(mockNdk);
    expect(await screen.findByText("Live Feed")).toBeInTheDocument();
  });

  it("should render navigation links", async () => {
    renderWithRouter("/");
    expect(await screen.findByText("Live Feed")).toBeInTheDocument();
    expect(screen.getByText("Following Feed")).toBeInTheDocument();
    expect(screen.getByText("Event Lookup")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("⭐ Favourites")).toBeInTheDocument();
  });

  it("should render the NostrFeed component on the home route with its initial state", async () => {
    renderWithRouter("/");
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
      expect(screen.getByText("Waiting for events…")).toBeInTheDocument();
    });
  });

  it("should render the NostrEventViewer on the /viewer route", async () => {
    renderWithRouter("/viewer");
    await waitFor(() => {
      expect(screen.getByText("Nostr Event Viewer")).toBeInTheDocument();
    });
  });

  // it("should render the NostrProfile on the /profile route", async () => {
  //   renderWithRouter("/profile");
  //   await waitFor(() => {
  //     expect(screen.getByText("Profile")).toBeInTheDocument();
  //     expect(
  //       screen.getByPlaceholderText("Enter npub or hex pubkey…"),
  //     ).toBeInTheDocument();
  //   });
  // });

  it("should render the NostrProfile with param on /profile/:pubkey route", async () => {
    renderWithRouter("/profile/abc123");
    await waitFor(() => {
      const input = screen.getByPlaceholderText("Enter npub or hex pubkey…");
      expect(input).toHaveValue("abc123");
    });
  });

  it("should render the NostrFavourites on the /favourites route", async () => {
    renderWithRouter("/favourites");
    await waitFor(() => {
      expect(screen.getByText("Favourites")).toBeInTheDocument();
      expect(screen.getByText("No favourite events yet.")).toBeInTheDocument();
    });
  });

  it("should have an active class on the current nav link", async () => {
    renderWithRouter("/favourites");
    const favLink = (await screen.findByText("⭐ Favourites")).closest("a");
    expect(favLink).toHaveClass("app__nav-btn--active");
  });

  it("should render the NostrFeed with relay URLs", async () => {
    renderWithRouter("/");
    await waitFor(() => {
      const feed = screen.getByText(/Relays:/);
      expect(feed).toBeInTheDocument();
      expect(screen.getByText(/relay\.primal\.net/)).toBeInTheDocument();
    });
  });

  it("should render the NostrFollowingFeed on the /following-feed route", async () => {
    renderWithRouter("/following-feed");
    await waitFor(() => {
      expect(screen.getByText("Following feed")).toBeInTheDocument();
      expect(
        screen.getByText("You're not following any accounts yet."),
      ).toBeInTheDocument();
    });
  });

  it("shows the scroll-to-top button after scrolling down and scrolls to the top on click", async () => {
    renderWithRouter("/favourites");
    await screen.findByText("⭐ Favourites");
    expect(
      screen.queryByRole("button", { name: "Scroll to top" }),
    ).not.toBeInTheDocument();

    Object.defineProperty(window, "scrollY", {
      value: 500,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(window);

    const button = screen.getByRole("button", { name: "Scroll to top" });
    fireEvent.click(button);
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });

    delete window.scrollY;
  });
});

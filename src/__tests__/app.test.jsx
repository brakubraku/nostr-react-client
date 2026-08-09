import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppLayout } from "../App";

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

  it("should render navigation links", () => {
    renderWithRouter("/");
    expect(screen.getByText("Live Feed")).toBeInTheDocument();
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
      // expect(
      //   screen.getByText(
      //     /Pass an <code> eventId <\/code> prop to view a specific event/,
      //   ),
      // ).toBeInTheDocument();
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

  it("should have an active class on the current nav link", () => {
    renderWithRouter("/favourites");
    const favLink = screen.getByText("⭐ Favourites").closest("a");
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
});

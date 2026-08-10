import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import NostrFollowing from "../NostrFollowing";

// Mock the follows module so tests stay isolated.
vi.mock("../follows", () => ({
  getFollows: Object.assign(vi.fn(() => []), {
    subscribe: vi.fn(() => vi.fn()),
  }),
  isFollowing: vi.fn(() => false),
  toggleFollow: vi.fn(() => true),
  removeFollow: vi.fn(),
  addFollow: vi.fn(() => true),
  followsToText: vi.fn(() => ""),
  importFollowsText: vi.fn(async () => ({
    imported: 0,
    duplicates: 0,
    invalid: 0,
  })),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderFollowing() {
  return render(
    <MemoryRouter>
      <NostrFollowing />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("NostrFollowing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  it("shows an empty state when no accounts are followed", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([]);

    renderFollowing();

    expect(
      screen.getByText("You're not following any accounts yet."),
    ).toBeInTheDocument();
  });

  it("renders followed accounts as a grid with pictures and names", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([
      {
        pubkey: "pk1",
        displayName: "Alice",
        picture: "https://example.com/alice.png",
      },
      {
        pubkey: "pk2",
        name: "bob",
        picture: "https://example.com/bob.png",
      },
    ]);

    const { container } = renderFollowing();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(container.querySelectorAll("img.nostr-following__avatar")).toHaveLength(2);

    const grid = container.querySelector(".nostr-following__grid");
    expect(grid).toBeInTheDocument();
    expect(grid.querySelectorAll(".nostr-following__card")).toHaveLength(2);
  });

  it("shows an initial placeholder when an account has no picture", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([
      { pubkey: "pk1", displayName: "Alice" },
    ]);

    const { container } = renderFollowing();

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(
      container.querySelector(".nostr-following__avatar-placeholder"),
    ).toBeInTheDocument();
  });

  it("navigates to the account's profile when a tile is clicked", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([
      { pubkey: "pk1", displayName: "Alice" },
    ]);

    renderFollowing();

    fireEvent.click(screen.getByTitle("View Alice's profile"));
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/pk1");
  });

  it("exports followed accounts to a txt file", async () => {
    const { getFollows, followsToText } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([
      { pubkey: "pk1", displayName: "Alice" },
      { pubkey: "pk2" },
    ]);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderFollowing();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(followsToText).toHaveBeenCalledWith([
      { pubkey: "pk1", displayName: "Alice" },
      { pubkey: "pk2" },
    ]);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(screen.getByRole("status")).toHaveTextContent("Exported 2 accounts.");
  });

  it("disables export when no accounts are followed", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([]);

    renderFollowing();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("imports accounts from a text file", async () => {
    const { importFollowsText } = await import("../follows");
    vi.mocked(importFollowsText).mockResolvedValue({
      imported: 2,
      duplicates: 1,
      invalid: 1,
    });

    const { container } = renderFollowing();
    const file = new File(["pk1\npk2\n"], "follows.txt", {
      type: "text/plain",
    });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Imported 2 accounts, 1 already followed, 1 invalid line skipped.",
    );
    expect(importFollowsText).toHaveBeenCalledWith("pk1\npk2\n");
  });

  it("shows a notice when the selected file contains no accounts", async () => {
    const { importFollowsText } = await import("../follows");
    vi.mocked(importFollowsText).mockResolvedValue({
      imported: 0,
      duplicates: 0,
      invalid: 0,
    });

    const { container } = renderFollowing();
    const file = new File(["just some text"], "notes.txt", {
      type: "text/plain",
    });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("No accounts found in that file.");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NostrFeed from "../NostrFeed";

// Use a stable NDK mock so we can inspect the filters passed to subscribe.
const mocks = vi.hoisted(() => {
  const subscribe = vi.fn(() => ({ stop: vi.fn() }));
  return {
    subscribe,
    ndk: {
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe,
    },
  };
});

describe("NostrFeed content type selector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dropdown with all content type options and defaults to long-form", () => {
    render(<NostrFeed ndk={mocks.ndk} />);
    const select = screen.getByLabelText("Content type");
    expect(select).toHaveValue("longform");
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Long-form content", "Text notes"]);
  });

  it("subscribes to long-form content (kind 30023) by default", async () => {
    render(<NostrFeed ndk={mocks.ndk} />);
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());
    expect(mocks.subscribe.mock.calls.at(-1)[0].kinds).toEqual([30023]);
  });

  it("re-subscribes with text notes (kind 1) when selected", async () => {
    render(<NostrFeed ndk={mocks.ndk} />);
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "notes" },
    });

    await waitFor(() => {
      expect(mocks.subscribe.mock.calls.at(-1)[0].kinds).toEqual([1]);
    });
  });

  it("re-subscribes without a kinds restriction for all content", async () => {
    render(<NostrFeed ndk={mocks.ndk} />);
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "all" },
    });

    await waitFor(() => {
      expect(mocks.subscribe.mock.calls.at(-1)[0].kinds).toBeUndefined();
    });
  });

  it("keeps the rest of the filter (e.g. limit) when changing content type", async () => {
    render(
      <NostrFeed ndk={mocks.ndk} filter={{ kinds: [30023], limit: 30 }} />,
    );
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "notes" },
    });

    await waitFor(() => {
      expect(mocks.subscribe.mock.calls.at(-1)[0]).toEqual({
        kinds: [1],
        limit: 30,
      });
    });
  });
});

import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  useTodayViewSync,
  type TodayViewSyncParams,
} from "../../app/(tabs)/use-today-view-sync";

interface TestRendererApi {
  create(element: React.ReactNode): { update(element: React.ReactNode): void };
  act(callback: () => void): void;
}
const TestRenderer: TestRendererApi = require("react-test-renderer");

function makeParams(
  overrides: Partial<TodayViewSyncParams> = {},
): TodayViewSyncParams {
  return {
    currentActiveView: "today",
    isSelectMode: false,
    pinnedDateStr: null,
    filters: {},
    setShowScrollTop: vi.fn(),
    setRenderBulkActionBar: vi.fn(),
    setActiveView: vi.fn(),
    setFilters: vi.fn(),
    setSearchQuery: vi.fn(),
    ...overrides,
  };
}

function Probe(props: TodayViewSyncParams) {
  useTodayViewSync(props);
  return null;
}

describe("useTodayViewSync (mobile)", () => {
  it("clears the search query when a pinned date is deep-linked", () => {
    const setSearchQuery = vi.fn();
    const initial = makeParams({ setSearchQuery });
    let renderer!: { update(element: React.ReactNode): void };
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(Probe, initial));
    });

    TestRenderer.act(() => {
      renderer.update(
        React.createElement(
          Probe,
          makeParams({ setSearchQuery, pinnedDateStr: "2026-07-20" }),
        ),
      );
    });

    expect(setSearchQuery).toHaveBeenCalledWith("");
  });

  it("clears the search query when the active view changes", () => {
    const setSearchQuery = vi.fn();
    const initial = makeParams({ setSearchQuery });
    let renderer!: { update(element: React.ReactNode): void };
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(Probe, initial));
    });

    TestRenderer.act(() => {
      renderer.update(
        React.createElement(
          Probe,
          makeParams({ setSearchQuery, currentActiveView: "all" }),
        ),
      );
    });

    expect(setSearchQuery).toHaveBeenCalledWith("");
  });
});

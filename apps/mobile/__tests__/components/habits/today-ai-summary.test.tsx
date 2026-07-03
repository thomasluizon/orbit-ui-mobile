import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const TestRenderer: typeof import("react-test-renderer") = require("react-test-renderer");

type RenderedNode = { type?: unknown; props: Record<string, unknown> };
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] };
};

const useSummaryMock = vi.fn();
const useProfileMock = vi.fn();

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => useProfileMock(),
}));

vi.mock("@/hooks/use-habits", () => ({
  useSummary: () => useSummaryMock(),
}));

vi.mock("@orbit/shared/utils", () => ({
  AI_SUMMARY_CLAMP_CHARS: 220,
}));

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({ currentScheme: "purple", currentTheme: "dark" }),
}));

vi.mock("@/lib/theme", () => ({
  radius: { full: 9999 },
  createTokensV2: () => ({
    primarySoft: "#b794f6",
    fg1: "#ffffff",
    fg2: "#cccccc",
    fg3: "#999999",
    hairline: "#333333",
    hairlineStrong: "#444444",
  }),
  tintFromPrimary: () => "rgba(127,70,247,0.16)",
}));

vi.mock("lucide-react-native", () => ({
  Sparkles: (props: Record<string, unknown>) =>
    React.createElement("Sparkles", props),
  ArrowUpRight: (props: Record<string, unknown>) =>
    React.createElement("ArrowUpRight", props),
}));

import { TodayAISummary } from "@/components/habits/today-ai-summary";

type CardRenderProp = (state: { pressed: boolean }) => React.ReactElement;

function renderCardBody(): RenderedTree | null {
  let outer: RenderedTree | null = null;
  TestRenderer.act(() => {
    outer = TestRenderer.create(
      React.createElement(TodayAISummary, { date: "2026-04-07" }),
    ) as unknown as RenderedTree;
  });
  if (!outer) {
    throw new Error("Expected the card to render");
  }
  const cards = (outer as RenderedTree).root.findAll(
    (node) =>
      typeof node.type !== "string" &&
      typeof node.props.children === "function" &&
      node.props.accessibilityRole === "button",
  );
  if (cards.length === 0) {
    return null;
  }
  const renderChild = cards[0]!.props.children as CardRenderProp;
  let inner: RenderedTree | null = null;
  TestRenderer.act(() => {
    inner = TestRenderer.create(
      renderChild({ pressed: false }),
    ) as unknown as RenderedTree;
  });
  return inner;
}

function insightNodes(tree: RenderedTree | null): RenderedNode[] {
  if (!tree) {
    return [];
  }
  return tree.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      typeof node.props?.accessibilityLabel === "string" &&
      (node.props.accessibilityLabel as string).startsWith(
        "summary.insightLabel:",
      ),
  );
}

describe("TodayAISummary insight chip (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the insight pill when pro, enabled, and an insight is present", () => {
    useProfileMock.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true, language: "en" },
    });
    useSummaryMock.mockReturnValue({
      summary: "You completed 3 of 4 habits today.",
      insight: "A short walk could lift the afternoon.",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const nodes = insightNodes(renderCardBody());

    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.props.accessibilityLabel).toBe(
      "summary.insightLabel: A short walk could lift the afternoon.",
    );
  });

  it("does not render the insight pill when there is no insight", () => {
    useProfileMock.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true, language: "en" },
    });
    useSummaryMock.mockReturnValue({
      summary: "You completed 3 of 4 habits today.",
      insight: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    expect(insightNodes(renderCardBody())).toHaveLength(0);
  });

  it("does not render the insight pill for free users even when an insight is present", () => {
    useProfileMock.mockReturnValue({
      profile: { hasProAccess: false, aiSummaryEnabled: false, language: "en" },
    });
    useSummaryMock.mockReturnValue({
      summary: null,
      insight: "should not show",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    expect(insightNodes(renderCardBody())).toHaveLength(0);
  });
});

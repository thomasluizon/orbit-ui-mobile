import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const TestRenderer: typeof import("react-test-renderer") = require("react-test-renderer");

type RenderedNode = { type?: unknown; props: Record<string, unknown> };
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] };
};

const useSummaryMock = vi.fn();
const useProfileMock = vi.fn();
const pushMock = vi.fn();

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock }),
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

vi.mock('@/components/ui/icons', () => ({
  ArrowUpRight: (props: Record<string, unknown>) =>
    React.createElement("ArrowUpRight", props),
}));

vi.mock("@/components/ui/astra-avatar", () => ({
  AstraMark: (props: Record<string, unknown>) =>
    React.createElement("AstraMark", props),
}));

import { TodayAISummary } from "@/components/habits/today-ai-summary";

type CardRenderProp = (state: { pressed: boolean }) => React.ReactElement;

function getCard(): RenderedNode | null {
  const outerHolder: { current: RenderedTree | null } = { current: null };
  TestRenderer.act(() => {
    outerHolder.current = TestRenderer.create(
      React.createElement(TodayAISummary, { date: "2026-04-07" }),
    ) as unknown as RenderedTree;
  });
  if (!outerHolder.current) {
    throw new Error("Expected the card to render");
  }
  const cards = (outerHolder.current as RenderedTree).root.findAll(
    (node) =>
      typeof node.type !== "string" &&
      typeof node.props.children === "function" &&
      node.props.accessibilityRole === "button",
  );
  return cards[0] ?? null;
}

function summaryTextNodes(card: RenderedNode, summary: string): RenderedNode[] {
  const renderChild = card.props.children as CardRenderProp;
  let inner: RenderedTree | null = null;
  TestRenderer.act(() => {
    inner = TestRenderer.create(
      renderChild({ pressed: false }),
    ) as unknown as RenderedTree;
  });
  return (inner as unknown as RenderedTree).root.findAll(
    (node) =>
      typeof node.type === "string" && node.props.children === summary,
  );
}

describe("TodayAISummary (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfileMock.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true, language: "en" },
    });
    useSummaryMock.mockReturnValue({
      summary: "You completed 3 of 4 habits today.",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("renders the summary message", () => {
    const card = getCard();
    expect(card).not.toBeNull();
    expect(
      summaryTextNodes(card!, "You completed 3 of 4 habits today."),
    ).toHaveLength(1);
  });

  it("routes to /chat when the card is pressed", () => {
    const card = getCard();
    (card!.props.onPress as () => void)();
    expect(pushMock).toHaveBeenCalledWith("/chat");
  });
});

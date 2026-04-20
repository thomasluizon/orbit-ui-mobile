import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProfile } from "@orbit/shared/__tests__/factories";

const TestRenderer = require("react-test-renderer");

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === "white" ? "#ffffff" : "#111111"),
  },
);

const mocks = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  state: {
    profile: null as ReturnType<typeof createMockProfile> | null,
    hasProAccess: false,
    isYearlyPro: false,
  },
}));

vi.mock("expo-router", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({
    profile: mocks.state.profile,
    isLoading: false,
  }),
  useHasProAccess: () => mocks.state.hasProAccess,
  useIsYearlyPro: () => mocks.state.isYearlyPro,
}));

vi.mock("@/hooks/use-gamification", () => ({
  useGamificationProfile: () => ({
    profile: null,
    isLoading: false,
    xpProgress: 0,
    achievementsByCategory: [],
  }),
}));

vi.mock("@/hooks/use-retrospective", () => ({
  useRetrospective: () => ({
    retrospective: null,
    setRetrospective: vi.fn(),
    isLoading: false,
    error: "",
    setError: vi.fn(),
    fromCache: false,
    period: "month",
    setPeriod: vi.fn(),
    generate: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-offline", () => ({
  useOffline: () => ({
    isOnline: true,
  }),
}));

vi.mock("@/hooks/use-go-back-or-fallback", () => ({
  useGoBackOrFallback: () => vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: vi.fn(),
}));

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}));

vi.mock("@/lib/theme", () => ({
  createColors: () => colorProxy,
  spacing: {
    pageX: 20,
    pageBottom: 40,
    sectionGap: 16,
    cardPadding: 20,
    cardGap: 12,
    itemGap: 8,
  },
}));

vi.mock("@/components/ui/pro-badge", () => ({
  ProBadge: () => null,
}));

vi.mock("@/components/ui/offline-unavailable-state", () => ({
  OfflineUnavailableState: () => null,
}));

vi.mock("@/components/gamification/achievement-card", () => ({
  AchievementCard: () => null,
}));

vi.mock("lucide-react-native", () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props);

  return {
    ArrowLeft: createIcon("ArrowLeft"),
    Lock: createIcon("Lock"),
    BarChart3: createIcon("BarChart3"),
  };
});

import AchievementsScreen from "@/app/achievements";
import RetrospectiveScreen from "@/app/retrospective";

describe("mobile upgrade guard redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      isTrialActive: false,
    });
    mocks.state.hasProAccess = false;
    mocks.state.isYearlyPro = false;
  });

  it("replaces to upgrade when achievements is opened by a free user", async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<AchievementsScreen />);
      await Promise.resolve();
    });

    expect(mocks.router.replace).toHaveBeenCalledWith("/upgrade");
    expect(mocks.router.push).not.toHaveBeenCalledWith("/upgrade");
  });

  it("replaces to upgrade when retrospective is opened without yearly pro access", async () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: true,
      isTrialActive: false,
    });
    mocks.state.hasProAccess = true;
    mocks.state.isYearlyPro = false;

    await TestRenderer.act(async () => {
      TestRenderer.create(<RetrospectiveScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.router.replace).toHaveBeenCalledWith("/upgrade");
    expect(mocks.router.push).not.toHaveBeenCalledWith("/upgrade");
  });
});

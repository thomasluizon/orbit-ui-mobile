import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProfile } from "@orbit/shared/__tests__/factories";

import AchievementsScreen from "@/app/achievements";
import RetrospectiveScreen from "@/app/retrospective";

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
    data: null,
    setData: vi.fn(),
    isLoading: false,
    error: "",
    setError: vi.fn(),
    noData: false,
    setNoData: vi.fn(),
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
    currentScheme: "purple",
    currentTheme: "dark",
  }),
}));

const tokensV2Proxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === "fgOnPrimary" ? "#ffffff" : "#111111"),
  },
);

vi.mock("@/lib/theme", () => ({
  createColors: () => colorProxy,
  createTokensV2: () => tokensV2Proxy,
  primaryGlow: () => ({}),
  tintFromPrimary: () => "rgba(17, 17, 17, 0.1)",
  shadowsV2: {
    shadow1: { elevation: 1 },
    shadow2: { elevation: 4 },
    shadow3: { elevation: 10 },
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    full: 9999,
  },
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

vi.mock("lucide-react-native", () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props);

  return {
    ArrowLeft: createIcon("ArrowLeft"),
    ChevronLeft: createIcon("ChevronLeft"),
    ChevronRight: createIcon("ChevronRight"),
    Lock: createIcon("Lock"),
    BarChart3: createIcon("BarChart3"),
    Orbit: createIcon("Orbit"),
    Sparkles: createIcon("Sparkles"),
    Check: createIcon("Check"),
  };
});

// Phase 5 v8 primitives consumed by the migrated sub-screens.
vi.mock("@/components/ui/app-bar", () => ({
  AppBar: ({ title }: { title?: string }) => React.createElement("AppBar", { title }),
}));

vi.mock("@/components/ui/section-label", () => ({
  SectionLabel: ({ children }: { children?: unknown }) => React.createElement("SectionLabel", null, children as never),
}));

vi.mock("@/components/ui/section-head-tabs", () => ({
  SectionHeadTabs: () => null,
}));

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

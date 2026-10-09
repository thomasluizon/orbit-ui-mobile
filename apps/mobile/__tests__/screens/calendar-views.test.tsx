import { format as formatDate } from 'date-fns/format'
import { ptBR as portugueseDates } from 'date-fns/locale/pt-BR'
import React from "react";
import * as timeFormatHook from '@/hooks/use-time-format'
import { RootScrollProvider } from '@/components/shell/root-scroll-context'
import { DestinationTabBar } from '@/components/navigation/destination-tab-bar'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __setWindowDimensions, __setScrollToImpl } from '../../test-mocks/react-native'

import en from "@orbit/shared/i18n/en.json";
import ptBR from "@orbit/shared/i18n/pt-BR.json";
import { addDays, differenceInCalendarDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCalendarMonthModel,
  buildHabitCreateHref,
  createTimeDisplay,
  formatAPIDate,
  formatAPIDateInTimeZone,
  parseAPIDate,
} from "@orbit/shared/utils";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useUIStore } from '@/stores/ui-store';
import CalendarScreen from "@/app/(tabs)/calendar";
import { expectSmallSheetActions } from '@/__tests__/support/sheet-slots'
import { advanceAccountGeneration } from '@/lib/session-epoch';
import { SafeAreaView } from 'react-native-safe-area-context'
import { ListRow } from '@/components/ui/list-row'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => <View testID="notification-bell" /> }));

const rootScrollMocks = vi.hoisted(() => ({ scrollToOffset: vi.fn() }))
vi.mock('react-native', async (importOriginal) => {
  const native = await importOriginal<typeof import('react-native')>()
  return { ...native, FlatList: React.forwardRef((props: React.ComponentProps<typeof native.FlatList>, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollToOffset: rootScrollMocks.scrollToOffset }))
    return <native.FlatList {...props}>{React.isValidElement(props.ListHeaderComponent) ? props.ListHeaderComponent : null}{React.isValidElement(props.ListFooterComponent) ? props.ListFooterComponent : null}</native.FlatList>
  }) }
})

const TestRenderer = require("react-test-renderer");
type CalendarGridComponent = typeof import("@/app/(tabs)/calendar/_components/calendar-grid")["CalendarGrid"];

const MOCK_ACCOUNT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function getMockAccountDateKey(): string {
  return formatAPIDateInTimeZone(new Date(), MOCK_ACCOUNT_TIME_ZONE);
}

const state = vi.hoisted(() => ({
  rangeMap: new Map<string, CalendarDayEntry[]>(),
  rangeLoading: false,
  rangeFetching: false,
  language: "en",
  periodGeometry: false,
  monthMap: new Map<string, CalendarDayEntry[]>(),
  monthLoading: false,
  monthFetching: false,
  monthError: null as string | null,
  monthRefresh: () => {},
  profile: undefined as {
    weekStartDay: 0 | 1;
    timeZone: string | null;
    hasProAccess: boolean;
  } | undefined,
  profileError: null as Error | null,
  profileRefetch: vi.fn(),
  calendarDataCalls: vi.fn(),
  calendarEvents: [] as Record<string, unknown>[],
  calendarEventsNotConnected: false,
  calendarEventsEnabled: undefined as boolean | undefined,
  autoSyncState: {
    enabled: true,
    status: "Idle",
    lastSyncedAt: "2026-09-12T09:12:00Z",
    hasGoogleConnection: true,
  },
  setAutoSync: vi.fn(() => Promise.resolve()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  calendarEventsTimeZone: undefined as string | null | undefined,
  calendarEventsPending: false,
  calendarEventsError: null as Error | null,
  calendarEventsRefetch: vi.fn(),
  calendarRangeCalls: vi.fn(),
  routerPush: vi.fn(),
  routeParams: {},
  setShowCreateModal: vi.fn(),
  setCalendarHasError: vi.fn(),
}));

const calendarGridProps = vi.hoisted(() => ({
  actual: null as CalendarGridComponent | null,
  current: null as Record<string, any> | null,
  header: null as Record<string, any> | null,
  stats: null as Record<string, any> | null,
}));

const calendarDayDetailProps = vi.hoisted(() => ({
  current: null as Record<string, any> | null,
}));

const calendarStatsProps = vi.hoisted(() => ({
  current: null as {
    stats: readonly { key: string; value: string | number }[];
    state?: "default" | "loading" | "empty";
  } | null,
}));

const tokensProxy: any = new Proxy({}, { get: () => "#222222" });

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.routerPush, replace: vi.fn() }),
  useLocalSearchParams: () => state.routeParams,
}));

vi.mock('@/components/calendar-sync/calendar-import-content', () => ({
  CalendarImportContent: (props: { reviewMode: boolean }) => React.createElement('CalendarImportContentMock', props),
}));



vi.mock('date-fns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns')>();
  return { ...actual, format: (date: Date, pattern: string) => state.periodGeometry ? formatDate(date, pattern, { locale: portugueseDates }) : actual.format(date, pattern) };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const messages = state.language === 'en' ? en : ptBR;
      if (state.periodGeometry && key === 'calendar.range.label') return messages.calendar.range.label.replace('{start}', String(params?.start)).replace('{end}', String(params?.end));
      if (key === 'dates.today') return messages.dates.today;
      if (key === 'dates.todayWithDate') return messages.dates.todayWithDate.replace('{date}', String(params?.date));
      if (key === 'calendar.period.goToCurrent') return messages.calendar.period.goToCurrent.replace('{period}', String(params?.period));
      if (key === 'calendar.timeGrid.noSetTime') return messages.calendar.timeGrid.noSetTime;
      if (key === 'calendar.entryLabel') return messages.calendar.entryLabel.replace('{title}', String(params?.title)).replace('{time}', String(params?.time)).replace('{status}', String(params?.status));
      if (key === 'calendar.status.upcoming') return messages.calendar.status.upcoming;
      return params ? `${key}:${JSON.stringify(params)}` : key;
    },
    i18n: { language: state.language },
  }),
}));

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({
    profile: state.profile,
    error: state.profileError,
    refetch: state.profileRefetch,
  }),
}));

vi.mock("@/hooks/use-time-format", () => ({
  useTimeFormat: () => createTimeDisplay(state.language, state.language !== 'en'),
}));

vi.mock("@/hooks/use-calendar-events", () => ({
  useCalendarEvents: (options?: { enabled?: boolean; timeZone?: string | null }) => {
    state.calendarEventsEnabled = options?.enabled;
    state.calendarEventsTimeZone = options?.timeZone;
    return {
      data: state.calendarEventsNotConnected
        ? { status: "not-connected" }
        : { status: "connected", events: state.calendarEvents },
      isPending: state.calendarEventsPending,
      error: state.calendarEventsError,
      refetch: state.calendarEventsRefetch,
    };
  },
}));

vi.mock("@/hooks/use-calendar-auto-sync", () => ({
  useCalendarAutoSyncState: () => ({ data: state.autoSyncState }),
  useSetCalendarAutoSync: () => ({ mutateAsync: state.setAutoSync }),
  useRunCalendarSyncNow: () => ({ mutateAsync: vi.fn(async () => {}) }),
}));

vi.mock("@/hooks/use-app-toast", () => ({
  useAppToast: () => ({ showError: state.showError, showSuccess: state.showSuccess }),
}));


vi.mock("@/hooks/use-horizontal-swipe", () => ({
  useHorizontalSwipe: ({
    onSwipeLeft,
    onSwipeRight,
    minDistance = 50,
  }: {
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    minDistance?: number;
  }) => ({
    fire(deltaX: number, deltaY = 0) {
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
      if (Math.abs(deltaX) <= minDistance) return;
      if (deltaX < 0) onSwipeLeft();
      else onSwipeRight();
    },
  }),
}));

vi.mock("@/hooks/use-habits", () => ({
  useCalendarData: (month: Date) => {
    state.calendarDataCalls(month)
    return ({
      dayMap: state.monthMap,
      isLoading: state.monthLoading,
      isFetching: state.monthFetching,
      error: state.monthError,
      refresh: state.monthRefresh,
    })
  },
  useCalendarRange: (start: Date, end: Date, enabled: boolean) => {
    state.calendarRangeCalls(start, end, enabled);
    return {
      dayMap: state.rangeMap,
      isLoading: state.rangeLoading,
      isFetching: state.rangeFetching,
      error: null,
      refresh: vi.fn(),
    };
  },
  useLogHabit: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({ currentScheme: "purple", currentTheme: "dark" }),
}));

vi.mock("@/lib/theme", () => ({
  createTokensV2: () => tokensProxy,
  tintFromPrimary: () => "rgba(0,0,0,0.1)",
  easings: {
    spring: [0.2, 0, 0, 1],
    out: [0.16, 1, 0.3, 1],
    smooth: [0.2, 0, 0, 1],
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, "2xl": 24, full: 9999 },
  shadowsV2: {
    shadow1: { elevation: 1 },
    shadow2: { elevation: 4 },
    shadow3: { elevation: 10 },
  },
}));

vi.mock("@/components/ui/sheet", async () => await import("@/__tests__/support/sheet-double"));
vi.mock("@/components/ui/section-label", () => ({ SectionLabel: () => null }));

vi.mock("@/app/(tabs)/calendar/_components/calendar-shell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(tabs)/calendar/_components/calendar-shell")>();
  return {
  CalendarHeader: (props: Record<string, any>) => {
    calendarGridProps.header = props;
    return <actual.CalendarHeader {...(props as React.ComponentProps<typeof actual.CalendarHeader>)} />;
  },
  CalendarLegend: () => <View testID="calendar-legend" />,
  };
});
vi.mock("@/app/(tabs)/calendar/_components/calendar-grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(tabs)/calendar/_components/calendar-grid")>();
  calendarGridProps.actual = actual.CalendarGrid;
  return {
    CalendarGrid: (props: Record<string, any>) => {
      calendarGridProps.current = props;
      return React.createElement(actual.CalendarGrid, props as React.ComponentProps<typeof actual.CalendarGrid>);
    },
  };
});
vi.mock("@/app/(tabs)/calendar/_components/calendar-stats", () => ({
  CalendarStats: (props: Record<string, any>) => {
    calendarGridProps.stats = props;
    const stats = props.stats as readonly { key: string; value: string | number }[];
    calendarStatsProps.current = {
      stats,
      state: props.state as "default" | "loading" | "empty" | undefined,
    };
    return (
      <View testID="calendar-stats">
        {stats.map((stat) => <Text key={stat.key}>{`${stat.key}:${stat.value}`}</Text>)}
      </View>
    );
  },
}));
vi.mock("@/app/(tabs)/calendar/_components/calendar-day-detail", () => ({
  CalendarDayDetail: (props: Record<string, any>) => {
    calendarDayDetailProps.current = props;
    return <View testID="calendar-day-detail" />;
  },
}));

type TestNode = { type: unknown; props: Record<string, any> };
type Tree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
  update: (element: React.ReactElement) => void;
};

function makeEntry(overrides: Partial<CalendarDayEntry>): CalendarDayEntry {
  return {
    habitId: "x",
    title: "Habit",
    status: "upcoming",
    isBadHabit: false,
    dueTime: "08:00",
    isOneTime: false,
    ...overrides,
  };
}

function hostTexts(tree: Tree): unknown[] {
  return tree.root
    .findAll((node) => typeof node.type === "string" && node.type === "Text" && node.props.importantForAccessibility !== 'no-hide-descendants')
    .flatMap((node) => {
      const children = node.props.children;
      const list = Array.isArray(children) ? children : [children];
      return list.filter(
        (child) => typeof child === "string" || typeof child === "number",
      );
    });
}

function toggleRecurring(tree: Tree) {
  const options = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'calendar.options')[0]!;
  TestRenderer.act(() => options.props.onPress());
  const recurring = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')[0]!;
  TestRenderer.act(() => recurring.props.onPress());
}

function pressView(tree: Tree, view: string) {
  const header = tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'FlatList').length ? renderMonthHeader(tree) : null;
  const segments = (header ?? tree).root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props.accessibilityRole === "radio" &&
      typeof node.props.testID === "string" &&
      node.props.testID.startsWith(`segment-${view}-`),
  );
  expect(segments.length).toBeGreaterThan(0);
  TestRenderer.act(() => {
    segments[0]!.props.onPress();
  });
  if (header) TestRenderer.act(() => header.update(<></>));
}

function renderMonthHeader(tree: Tree): import("react-test-renderer").ReactTestRenderer {
  const flatList = tree.root.findAll(
    (node) => typeof node.type === "string" && node.type === "FlatList",
  )[0];
  let headerTree!: import("react-test-renderer").ReactTestRenderer;
  TestRenderer.act(() => {
    headerTree = TestRenderer.create(flatList!.props.ListHeaderComponent);
  });
  return headerTree;
}

function openSelectedDay(
  tree: Tree,
  selectedDay: string,
): import("react-test-renderer").ReactTestRenderer {
  const headerTree = renderMonthHeader(tree);
  TestRenderer.act(() => {
    calendarGridProps.current!.onSelectDay(selectedDay);
  });
  return headerTree;
}

function renderMonthFooter(tree: Tree): import("react-test-renderer").ReactTestRenderer {
  const flatList = tree.root.findAll(
    (node) => typeof node.type === "string" && node.type === "FlatList",
  )[0];
  let footerTree!: import("react-test-renderer").ReactTestRenderer;
  TestRenderer.act(() => {
    footerTree = TestRenderer.create(flatList!.props.ListFooterComponent);
  });
  return footerTree;
}

function setBoundaryEntries(firstDay: string, secondDay: string) {
  state.monthMap = new Map([
    [firstDay, [makeEntry({ habitId: "first", status: "completed" })]],
    [
      secondDay,
      [
        makeEntry({ habitId: "second", status: "completed" }),
        makeEntry({ habitId: "missed", status: "upcoming" }),
      ],
    ],
  ]);
}

describe("CalendarScreen views (mobile)", () => {
  it.each(['month', 'week', 'range', 'agenda'])('keeps the %s frame mounted and its inset equal when the profile resolves', (view) => {
    state.profile = undefined;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const findHost = (testID: string) => tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0]!;
    const findRadio = () => tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID?.startsWith(`segment-${view}-`))[0]!;
    TestRenderer.act(() => { findRadio().props.onPress(); });
    const radio = findRadio();
    const header = findHost('calendar-header-group');
    const heading = tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')[0]!;
    const options = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'calendar.options')[0]!;
    const topInset = () => {
      type InsetNode = TestNode & { parent: InsetNode | null };
      const host = findHost('calendar-header-group') as InsetNode;
      let inset = Number(StyleSheet.flatten<ViewStyle>(host.props.style).paddingTop ?? 0);
      for (let ancestor = host.parent; ancestor; ancestor = ancestor.parent) {
        if (typeof ancestor.type !== 'string') continue;
        inset += Number(StyleSheet.flatten<ViewStyle>(ancestor.props.style).paddingTop ?? 0);
        inset += Number(StyleSheet.flatten<ViewStyle>(ancestor.props.contentContainerStyle).paddingTop ?? 0);
      }
      return inset;
    };
    const loadingInset = topInset();
    state.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: false };
    TestRenderer.act(() => { tree.update(<CalendarScreen />); });
    expect.soft(findRadio() === radio).toBe(true);
    expect.soft(findHost('calendar-header-group') === header).toBe(true);
    expect.soft(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')[0] === heading).toBe(true);
    expect.soft(tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'calendar.options')[0] === options).toBe(true);
    expect.soft(topInset()).toBe(loadingInset);
    expect.soft(topInset()).toBe(12);
    TestRenderer.act(() => tree.update(<></>));
  });

  it.each([320, 412, 600, 840])('keeps all view switches aligned with 24 dp body clearance at %i dp', (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 });
    type Host = Parameters<typeof measureProfileRow>[0] & { props: { testID?: string } };
    let tree!: Tree & { toJSON: () => Host | Host[]; unmount: () => void };
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    state.language = 'pt-BR';
    state.periodGeometry = true;
    TestRenderer.act(() => tree.update(<CalendarScreen />));
    let switchTop: number | undefined;
    try {
      for (const view of ['month', 'week', 'range', 'agenda'] as const) {
        if (view !== 'month') pressView(tree, view);
        const month = view === 'month' ? renderMonthHeader(tree) as unknown as Tree & { toJSON: () => Host | Host[] } : undefined;
        const hosts = [(month ?? tree).toJSON()].flat();
        const findBand = (children: Host[]): Host[] | undefined => {
          const index = children.findIndex((host) => host.props.testID === 'calendar-header-group');
          if (index >= 0) return children.slice(index, index + 2);
          return children.map((host) => findBand((host.children ?? []).filter((child): child is Host => typeof child !== 'string'))).find(Boolean);
        };
        const band = findBand(hosts)!;
        const measured = measureProfileRow({ type: 'View', props: {}, children: band }, width, 1);
        const segments = measured.controls.filter((control) => control.labels.some((label) => label.startsWith('calendar.view.')));
        const top = Math.min(...segments.map((segment) => segment.top));
        const bottom = Math.max(...segments.map((segment) => segment.bottom));
        if (switchTop === undefined) switchTop = top;
        expect.soft(top, view).toBe(switchTop);
        const firstBodyText = measured.texts.filter((text) => text.top >= bottom).sort((a, b) => a.top - b.top)[0]!;
        expect.soft(firstBodyText.top - bottom, `${view} body clearance`).toBe(24);
        if (month) TestRenderer.act(() => month.update(<></>));
      }
    } finally { TestRenderer.act(() => tree.unmount()); }
  });

  it('returns Semana to profile today across a device week boundary', () => {
    const clock = vi.spyOn(timeFormatHook, 'useTimeFormat').mockReturnValue({ ...createTimeDisplay('en', false), displayTime: (time) => time ?? '' });
    const previousZone = process.env.TZ;
    process.env.TZ = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T00:30:00Z'));
    state.profile = { weekStartDay: 1, timeZone: 'America/Sao_Paulo', hasProAccess: true };
    let tree!: Tree;
    try {
      TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
      pressView(tree, 'week');
      const current = () => tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel?.endsWith(', go to today'))[0]!;
      expect.soft(state.calendarRangeCalls.mock.lastCall!.slice(0, 2).map(formatAPIDate)).toEqual(['2026-09-28', '2026-10-04']);
      const next = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'common.nextWeek')[0]!;
      TestRenderer.act(() => next.props.onPress());
      expect.soft(state.calendarRangeCalls.mock.lastCall!.slice(0, 2).map(formatAPIDate)).toEqual(['2026-10-05', '2026-10-11']);
      TestRenderer.act(() => current().props.onPress());
      expect(state.calendarRangeCalls.mock.lastCall!.slice(0, 2).map(formatAPIDate)).toEqual(['2026-09-28', '2026-10-04']);
    } finally {
      TestRenderer.act(() => tree.update(<></>));
      if (previousZone === undefined) Reflect.deleteProperty(process.env, 'TZ');
      else process.env.TZ = previousZone;
      vi.useRealTimers();
      clock.mockRestore();
    }
  });

  it.each([false, true])('uses profile today after loading while preserving explicit week navigation: %s', (navigated) => {
    const clock = vi.spyOn(timeFormatHook, 'useTimeFormat').mockReturnValue({ ...createTimeDisplay('en', false), displayTime: (time) => time ?? '' });
    const previousZone = process.env.TZ;
    process.env.TZ = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T00:30:00Z'));
    state.profile = undefined;
    let tree!: Tree;
    try {
      TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
      pressView(tree, 'week');
      if (navigated) {
        const next = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'common.nextWeek')[0]!;
        TestRenderer.act(() => next.props.onPress());
      }
      state.profile = { weekStartDay: 1, timeZone: 'America/Sao_Paulo', hasProAccess: true };
      TestRenderer.act(() => tree.update(<CalendarScreen />));
      expect(state.calendarRangeCalls.mock.lastCall!.slice(0, 2).map(formatAPIDate)).toEqual(navigated ? ['2026-10-12', '2026-10-18'] : ['2026-09-28', '2026-10-04']);
    } finally {
      TestRenderer.act(() => tree.update(<></>));
      if (previousZone === undefined) Reflect.deleteProperty(process.env, 'TZ');
      else process.env.TZ = previousZone;
      vi.useRealTimers();
      clock.mockRestore();
    }
  });

  it('pages the agenda query and restores the days ahead from its header', () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    pressView(tree, 'agenda');
    const initial = state.calendarRangeCalls.mock.lastCall!;
    const press = (label: string) => {
      const button = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
      expect(button).toBeDefined();
      TestRenderer.act(() => button!.props.onPress());
    };
    press('common.nextWeek');
    expect(differenceInCalendarDays(state.calendarRangeCalls.mock.lastCall![0], initial[0])).toBe(7);
    expect(differenceInCalendarDays(state.calendarRangeCalls.mock.lastCall![1], initial[1])).toBe(7);
    press('common.previousWeek');
    expect(state.calendarRangeCalls.mock.lastCall!.slice(0, 2)).toEqual(initial.slice(0, 2));
    press('common.previousWeek');
    const today = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel?.endsWith(', go to today'))[0];
    expect(today).toBeDefined();
    TestRenderer.act(() => today!.props.onPress());
    expect(state.calendarRangeCalls.mock.lastCall!.slice(0, 2)).toEqual(initial.slice(0, 2));
    TestRenderer.act(() => tree.update(<></>));
  });

  it.each([1, 2])('keeps the week pager above the selector at 320 dp and font scale %i', (scale) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4, 12));
    __setWindowDimensions({ width: 320, height: 900, scale: 1, fontScale: scale });
    state.language = 'pt-BR';
    state.periodGeometry = true;
    type Host = Parameters<typeof measureProfileRow>[0] & { props: { testID?: string } };
    let tree!: Tree & { toJSON: () => Host | Host[]; unmount: () => void };
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    pressView(tree, 'week');
    try {
      const findHeader = (host: Host): Host | undefined => host.props.testID === 'calendar-header-group' ? host :
        (host.children ?? []).filter((child): child is Host => typeof child !== 'string').map(findHeader).find(Boolean);
      const header = [tree.toJSON()].flat().map(findHeader).find(Boolean)!;
      const measured = measureProfileRow(header, 320, scale);
      const pager = measured.controls.filter((control) => ['common.previousWeek', 'common.nextWeek'].includes(control.accessibilityLabel ?? '') || control.accessibilityLabel?.endsWith(', ir para hoje'));
      expect(pager).toHaveLength(3);
      const segments = measured.controls.filter((control) => control.labels.some((label) => label.startsWith('calendar.view.')));
      expect(segments).toHaveLength(4);
      for (const control of pager) {
        expect(control.bottom).toBeLessThanOrEqual(Math.min(...segments.map((segment) => segment.top)));
        expect(control.width).toBeGreaterThanOrEqual(48);
        expect(control.height).toBeGreaterThanOrEqual(48);
        expect(control.left).toBeGreaterThanOrEqual(16);
        expect(control.right).toBeLessThanOrEqual(304);
      }
      const title = measured.texts.find((text) => text.label === pager.find((control) => control.labels.length)!.labels[0])!;
      expect.soft(title.clipped).toBe(false);
      if (scale === 1) {
        expect.soft(new Set(pager.map((control) => control.top)).size).toBe(1);
        expect.soft(Math.min(...segments.map((segment) => segment.top))).toBe(76);
        expect.soft(title.lines).toBe(1);
      }
      const titleControl = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel?.endsWith(', ir para hoje'))[0]!;
      expect(StyleSheet.flatten(titleControl.props.style({ pressed: true })).borderRadius).toBe(12);
      const initial = pager.find((control) => control.labels.length)!.labels[0];
      for (const label of ['common.nextWeek', 'common.previousWeek']) {
        const control = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]!;
        TestRenderer.act(() => control.props.onPress());
        expect(tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.checked)).toHaveLength(1);
      }
      expect(hostTexts(tree)).toContain(initial);
    } finally { TestRenderer.act(() => tree.unmount()); vi.useRealTimers(); }
  });

  it.each([1, 2])('keeps the range label beside both 48 dp targets at 320 dp and font scale %i', (scale) => {
    __setWindowDimensions({ width: 320, height: 900, scale: 1, fontScale: scale });
    state.language = 'pt-BR';
    state.periodGeometry = true;
    type Host = Parameters<typeof measureProfileRow>[0] & { props: { testID?: string } };
    let tree!: Tree & { toJSON: () => Host | Host[]; unmount: () => void };
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    pressView(tree, 'range');
    try {
      const findRange = (host: Host): Host | undefined => host.props.testID === 'calendar-range-navigation' ? host :
        (host.children ?? []).filter((child): child is Host => typeof child !== 'string').map(findRange).find(Boolean);
      const navigation = [tree.toJSON()].flat().map(findRange).find(Boolean)!;
      const header = { type: 'View', props: { style: { paddingHorizontal: 16 } }, children: [navigation] };
      expect(navigation).toBeDefined();

      expect(header).toBeDefined();
      const measured = measureProfileRow(header, 320, scale);
      const label = measured.texts.find((text) => text.label === '30 ago a 12 set')!;
      expect(measured.controls).toHaveLength(3);
      expect(label.clipped).toBe(false);
      if (scale === 1) {
        expect(label.lines).toBe(1);
        for (const control of measured.controls) expect(Math.abs((label.top + label.bottom - control.top - control.bottom) / 2)).toBeLessThanOrEqual(2);
      }
      for (const control of measured.controls) {
        expect(control.left).toBeGreaterThanOrEqual(16);
        expect(control.right).toBeLessThanOrEqual(304);
        expect(control.width).toBeGreaterThanOrEqual(48);
        expect(control.height).toBeGreaterThanOrEqual(48);
      }
      for (const label of ['calendar.range.previous', 'calendar.range.next']) {
        const control = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]!;
        TestRenderer.act(() => control.props.onPress());
      }
      expect(hostTexts(tree)).toContain('30 ago a 12 set');
      expect(tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.checked)).toHaveLength(1);
    } finally { TestRenderer.act(() => tree.unmount()); }
  });

  it.each([
    ['en', 1, ['M', 'T', 'W', 'T', 'F', 'S', 'S']],
    ['en', 0, ['S', 'M', 'T', 'W', 'T', 'F', 'S']],
    ['pt-BR', 1, ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']],
    ['pt-BR', 0, ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']],
  ] as const)('renders drawn month and range weekday letters in %s starting on %i', (language, weekStartDay, labels) => {
    state.language = language;
    state.profile = { weekStartDay, timeZone: MOCK_ACCOUNT_TIME_ZONE, hasProAccess: true };
    let tree!: import('react-test-renderer').ReactTestRenderer;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const headerTree = renderMonthHeader(tree);
    const monthHeader = headerTree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'month-grid-header')[0]!;
    expect(monthHeader.findAll((node: TestNode) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants').map((node) => node.props.children)).toEqual(labels);
    TestRenderer.act(() => { headerTree.update(<></>); });
    pressView(tree, 'range');
    const rangeHeader = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'month-grid-header')[0]!;
    expect(rangeHeader.findAll((node: TestNode) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants').map((node) => node.props.children)).toEqual(labels);
    TestRenderer.act(() => { tree.update(<></>); });
  });

  beforeEach(() => {
    sheetTestControls.defer(false);
    useUIStore.setState({ calendarShowRecurring: true, setCalendarHasError: state.setCalendarHasError });
    state.language = "en";
    state.periodGeometry = false;
    __setWindowDimensions({ width: 412, height: 900, scale: 1, fontScale: 1 });
    state.routeParams = {};
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:00:00.000Z"));
    calendarGridProps.current = null;
    calendarDayDetailProps.current = null;
    calendarGridProps.header = null;
    calendarGridProps.stats = null;
    state.monthMap = new Map();
    state.rangeLoading = false;
    state.monthLoading = false;
    state.monthFetching = false;
    state.rangeFetching = false;
    state.monthError = null;
    state.monthRefresh = () => {};
    state.profile = { weekStartDay: 1, timeZone: MOCK_ACCOUNT_TIME_ZONE, hasProAccess: false };
    state.profileError = null;
    state.profileRefetch = vi.fn();
    state.calendarDataCalls.mockClear();
    state.calendarEvents = [];
    state.calendarEventsNotConnected = false;
    state.calendarEventsEnabled = undefined;
    state.setAutoSync.mockClear();
    state.showError.mockClear();
    state.showSuccess.mockClear();
    state.calendarEventsTimeZone = undefined;
    state.calendarEventsPending = false;
    state.calendarEventsError = null;
    state.calendarEventsRefetch = vi.fn();
    state.routerPush.mockClear();
    state.calendarRangeCalls.mockClear();
    state.rangeLoading = false;
    calendarStatsProps.current = null;
    state.routerPush.mockClear();
    state.setShowCreateModal.mockClear();
    state.setCalendarHasError.mockClear();
    const todayStr = getMockAccountDateKey();
    state.monthMap = new Map();
    state.rangeMap = new Map<string, CalendarDayEntry[]>([
      [
        todayStr,
        [
          makeEntry({ habitId: "r", title: "Recurring", isOneTime: false }),
          makeEntry({
            habitId: "o",
            title: "OneTime",
            isOneTime: true,
            dueTime: "09:00",
          }),
        ],
      ],
    ]);
  });


  it('leaves the top safe area to the shell', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />) })
    const safeAreas = tree.root.findAll((node) => node.type === SafeAreaView)
    expect(safeAreas.length).toBeGreaterThan(0)
    for (const safeArea of safeAreas) expect(safeArea.props.edges).toEqual(['left', 'right'])
    TestRenderer.act(() => tree.update(<></>))
  })

  it("renders the agenda at phone width without folding it back to month", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    const monthHeader = renderMonthHeader(tree!);
    const switchers = monthHeader.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "radiogroup" &&
        node.props.accessibilityLabel === "calendar.view.switchLabel",
    );
    const segments = monthHeader.root.findAll(
      (node) =>
        typeof node.type === "string" && node.props.accessibilityRole === "radio",
    );

    expect(switchers).toHaveLength(1);
    expect(segments).toHaveLength(4);
    expect(
      segments.find(
        (segment) => segment.props.testID === "segment-month-selected-enabled",
      )?.props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      segments.some(
        (segment) => segment.props.testID === "segment-agenda-unselected-enabled",
      ),
    ).toBe(true);

    const flatLists = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    );
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatLists[0]!.props.ListHeaderComponent);
    });
    expect(calendarGridProps.current?.selectedDay).toBe(formatAPIDate(new Date()));
    TestRenderer.act(() => headerTree.update(<></>));

    pressView(tree!, "agenda");
    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-agenda-view",
      ),
    ).toHaveLength(1);
    expect(hostTexts(tree!).some((text) => String(text).startsWith("Today,"))).toBe(true);
    const agendaRows = tree!.root.findAll((node) => node.type === ListRow);
    expect(agendaRows).toHaveLength(2);
    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.accessibilityRole === "header",
      ),
    ).toHaveLength(8);
    for (const row of agendaRows) {
      expect(row.props.readOnly).not.toBe(true);
      expect(row.props.compact).not.toBe(true);
      expect(row.props.textMode).toBe("personal");
      expect(row.props.value).toBeTypeOf("string");
      expect(row.props.onPress).toBeUndefined();
      expect(row.props.onClick).toBeTypeOf("function");
    }
  });

  it.each(['en', 'pt-BR'])('announces a full clamped agenda title and formatted time in %s before disclosure', (language) => {
    state.language = language;
    const title = 'A complete calendar title with all preparation steps and its destination '.repeat(8).trim();
    state.rangeMap = new Map([[getMockAccountDateKey(), [
      makeEntry({ habitId: 'timed', title, dueTime: '09:00' }),
      makeEntry({ habitId: 'untimed', title: 'Untimed', dueTime: null }),
    ]]]);
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    try {
      pressView(tree, 'agenda');
      const buttons = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button');
      const messages = language === 'en' ? en : ptBR;
      expect(buttons.some((node) => node.props.accessibilityLabel === `${title}, ${language === 'en' ? '9:00 AM' : '09:00'}, ${messages.calendar.status.upcoming}`)).toBe(true);
      expect(buttons.some((node) => node.props.accessibilityLabel === `Untimed, ${messages.calendar.timeGrid.noSetTime}, ${messages.calendar.status.upcoming}`)).toBe(true);
      expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0);
      const preview = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === title)[0]!;
      expect(preview.props.numberOfLines).toBe(1);
    } finally { TestRenderer.act(() => tree.update(<></>)); }
  });

  it('discloses an agenda name and preserves the view after native dismissal', () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    pressView(tree, 'agenda');
    const row = tree.root.findAll((node) => node.type === ListRow)[1]!;
    TestRenderer.act(() => row.props.onClick());
    const sheet = tree.root.findAll((node) => node.type === 'Sheet')[0]!;
    expect(sheet).toBeDefined();
    expect(hostTexts(tree)).toContain('OneTime');
    const dismiss = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss')[0]!;
    TestRenderer.act(() => dismiss.props.onPress());
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0);
    expect(tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'calendar-agenda-view')).toHaveLength(1);
    expect(state.routerPush).not.toHaveBeenCalled();
    TestRenderer.act(() => tree.update(<></>));
  });

  it.each(['month', 'range'] as const)('keeps the %s first-load skeleton and shows no indicator during a refetch', (view) => {
    state.monthLoading = view === 'month';
    state.monthFetching = view === 'month';
    state.rangeLoading = view === 'range';
    state.rangeFetching = view === 'range';
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    if (view === 'range') pressView(tree, 'range');
    const header = view === 'month' ? renderMonthHeader(tree) : undefined;
    const footer = view === 'month' ? renderMonthFooter(tree) : undefined;
    const surface = header ?? tree;
    const indicators = () => surface.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar');
    const grids = () => surface.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-grid');
    const details = () => surface.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-day-detail');
    const days = () => surface.root.findAll((node) => typeof node.type === 'string' && typeof node.props.testID === 'string' && node.props.testID.startsWith('day-cell-'));
    const update = () => {
      TestRenderer.act(() => { tree.update(<CalendarScreen />); });
      if (header && footer) {
        const list = tree.root.findAll((node) => node.type === 'FlatList')[0]!;
        TestRenderer.act(() => { header.update(list.props.ListHeaderComponent); footer.update(list.props.ListFooterComponent); });
      }
    };

    try {
      expect(indicators().length).toBeGreaterThan(0);
      expect(grids().length).toBeGreaterThan(0);
      if (view === 'month') expect(surface.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-settings')).toHaveLength(1);

      state.monthLoading = false;
      state.monthFetching = false;
      state.rangeLoading = false;
      state.rangeFetching = false;
      state.monthMap = new Map([[getMockAccountDateKey(), [makeEntry({ status: 'completed' })]]]);
      state.rangeMap = state.monthMap;
      update();
      expect(indicators()).toHaveLength(0);
      expect(view === 'month' ? details().length : days().length).toBeGreaterThan(0);

      state.monthFetching = view === 'month';
      state.rangeFetching = view === 'range';
      update();
      expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-loading-bar')).toHaveLength(0);
      expect(indicators()).toHaveLength(0);
      expect(view === 'month' ? details().length : days().length).toBeGreaterThan(0);
      expect(calendarStatsProps.current?.state ?? 'default').toBe('default');
    } finally {
      TestRenderer.act(() => { header?.update(<></>); footer?.update(<></>); tree.update(<></>); });
    }
  });

  it("renders agenda placeholders instead of empty-day copy while loading", () => {
    state.rangeMap = new Map();
    state.rangeLoading = true;
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree, "agenda");

    expect(
      tree.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-agenda-loading-day",
      ),
    ).toHaveLength(7);
    expect(hostTexts(tree)).not.toContain("calendar.agenda.empty");
    TestRenderer.act(() => tree.update(<></>));
  });

  it("passes only the selected day's Google events to the day detail", () => {
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    const selectedDay = formatAPIDate(new Date());
    state.calendarEvents = [
      {
        id: "selected-event",
        title: "Team meeting",
        description: null,
        startDate: selectedDay,
        startTime: "09:00",
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
      {
        id: "other-event",
        title: "Tomorrow",
        description: null,
        startDate: "2099-01-01",
        startTime: "10:00",
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
    ];

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree!, selectedDay);

    expect(
      calendarDayDetailProps.current?.calendarEvents.map(
        (event: { id: string }) => event.id,
      ),
    ).toEqual(["selected-event"]);
    expect(state.calendarEventsTimeZone).toBe("UTC");
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => (tree as unknown as import("react-test-renderer").ReactTestRenderer).update(<></>));
  });

  it("passes a failed Google events query to the selected-day panel", () => {
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    state.calendarEventsError = new Error("calendar events unavailable");
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("failed");
    TestRenderer.act(() => {
      calendarDayDetailProps.current?.onRetryCalendarEvents();
    });
    expect(state.calendarEventsRefetch).toHaveBeenCalledTimes(1);
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("passes a revoked Google authorization to the selected-day panel", () => {
    sheetTestControls.defer(true);
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    state.calendarEventsNotConnected = true;
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("not-connected");
    expect(calendarDayDetailProps.current?.calendarEvents).toEqual([]);
    TestRenderer.act(() => {
      calendarDayDetailProps.current?.onReconnectCalendarEvents();
    });
    expect(sheetTestControls.isDismissPending).toBe(false);
    expect(tree.root.findAll((node) => node.type === 'Sheet' && node.props.title === 'calendar.calendars.title')).toHaveLength(1);
    expect(state.routerPush).not.toHaveBeenCalledWith("/calendar-sync");
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it('opens the review sheet from a review notification route', () => {
    state.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true };
    state.routeParams = { mode: 'review' };
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    expect(tree.root.findAll((node) => node.type === 'CalendarImportContentMock' && node.props.reviewMode === true)).toHaveLength(1);
    const content = tree.root.findAll((node) => node.type === 'CalendarImportContentMock')[0]!
    TestRenderer.act(() => content.props.onActionStateChange({ count: 1, disabled: false }))
    expectSmallSheetActions(tree.root)
    TestRenderer.act(() => tree.update(<></>));
  });

  it('opens Today from Calendar import only after the sheet finishes dismissing', () => {
    sheetTestControls.defer(true);
    state.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true };
    state.routeParams = { mode: 'review' };
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const content = tree.root.findAll((node) => node.type === 'CalendarImportContentMock')[0]!;
    TestRenderer.act(() => content.props.onGoToHabits());
    expect(sheetTestControls.isDismissPending).toBe(true);
    expect(state.routerPush).not.toHaveBeenCalled();
    TestRenderer.act(() => sheetTestControls.completeDismissal());
    expect(state.routerPush).toHaveBeenCalledExactlyOnceWith('/(tabs)');
    expect(state.routerPush).not.toHaveBeenCalledWith('/');
    TestRenderer.act(() => tree.update(<></>));
  });

  it("passes a resolved empty Google events query as ready", () => {
    state.profile = { weekStartDay: 1, timeZone: "UTC", hasProAccess: true };
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("ready");
    expect(calendarDayDetailProps.current?.calendarEvents).toEqual([]);
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("does not enable the calendar event request for a free profile", () => {
    sheetTestControls.defer(true);
    state.calendarEvents = [
      {
        id: "retained-event",
        title: "Retained meeting",
        description: null,
        startDate: formatAPIDate(new Date()),
        startTime: "09:00",
        endTime: null,
        isRecurring: false,
        recurrenceRule: null,
        reminders: [],
      },
    ];
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const headerTree = openSelectedDay(tree, formatAPIDate(new Date()));

    expect(state.calendarEventsEnabled).toBe(false);
    expect(calendarDayDetailProps.current?.calendarEvents).toEqual([]);
    expect(calendarDayDetailProps.current?.calendarEventsState).toBe("pro-boundary");
    TestRenderer.act(() => {
      calendarDayDetailProps.current?.onViewPro();
    });
    expect(sheetTestControls.isDismissPending).toBe(false);
    expect(state.routerPush).toHaveBeenCalledWith("/upgrade");
    TestRenderer.act(() => headerTree.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("uses UTC when the mounted screen has a nullable account timezone", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T01:30:00.000Z"));
    state.profile = { weekStartDay: 1, timeZone: null, hasProAccess: false };
    let tree!: Tree;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      headerTree = renderMonthHeader(tree);

      expect(calendarGridProps.current?.todayKey).toBe("2026-09-12");
    } finally {
      TestRenderer.act(() => headerTree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it("advances at account midnight while the device remains on the previous day", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T09:59:59.000Z"));
    state.profile = { weekStartDay: 1, timeZone: "Pacific/Kiritimati", hasProAccess: false };
    let tree!: Tree;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      headerTree = renderMonthHeader(tree);
      expect(calendarGridProps.current?.todayKey).toBe("2026-09-11");

      TestRenderer.act(() => {
        vi.advanceTimersByTime(2_000);
      });
      const flatList = tree.root.findAll(
        (node) => typeof node.type === "string" && node.type === "FlatList",
      )[0];
      TestRenderer.act(() => {
        headerTree.update(flatList!.props.ListHeaderComponent);
      });
      expect(calendarGridProps.current?.todayKey).toBe("2026-09-12");
    } finally {
      TestRenderer.act(() => headerTree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it("reclassifies days immediately after a mounted profile timezone change", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T10:30:00.000Z"));
    state.profile = { weekStartDay: 1, timeZone: "Pacific/Kiritimati", hasProAccess: false };
    let tree!: Tree;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      headerTree = renderMonthHeader(tree);
      expect(calendarGridProps.current?.todayKey).toBe("2026-09-12");

      state.profile = { weekStartDay: 1, timeZone: "America/Los_Angeles", hasProAccess: false };
      TestRenderer.act(() => {
        tree.update(<CalendarScreen />);
      });
      const flatList = tree.root.findAll(
        (node) => typeof node.type === "string" && node.type === "FlatList",
      )[0];
      TestRenderer.act(() => {
        headerTree.update(flatList!.props.ListHeaderComponent);
      });

      expect(calendarGridProps.current?.todayKey).toBe("2026-09-11");
    } finally {
      TestRenderer.act(() => tree.update(<></>));
      TestRenderer.act(() => headerTree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it.each([
    {
      name: "device date is one day ahead",
      deviceTimeZone: "Pacific/Kiritimati",
      accountTimeZone: "America/Los_Angeles",
      now: "2026-09-12T10:30:00.000Z",
      firstDay: "2026-09-12",
      secondDay: "2026-09-13",
      expected: ["bestStreak:1", "totalLogs:1", "missed:0"],
    },
    {
      name: "device date is one day behind",
      deviceTimeZone: "America/Los_Angeles",
      accountTimeZone: "UTC",
      now: "2026-09-12T00:30:00.000Z",
      firstDay: "2026-09-11",
      secondDay: "2026-09-12",
      expected: ["bestStreak:2", "totalLogs:2", "missed:1"],
    },
  ])("renders statistics through the account date when $name", ({
    deviceTimeZone,
    accountTimeZone,
    now,
    firstDay,
    secondDay,
    expected,
  }) => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = deviceTimeZone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.profile = { weekStartDay: 1, timeZone: accountTimeZone, hasProAccess: false };
    setBoundaryEntries(firstDay, secondDay);
    let tree!: Tree;
    let footerTree!: import("react-test-renderer").ReactTestRenderer;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });
      footerTree = renderMonthFooter(tree);

      for (const figure of expected) expect(hostTexts(footerTree)).toContain(figure);
    } finally {
      TestRenderer.act(() => footerTree.update(<></>));
      TestRenderer.act(() => tree.update(<></>));
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it.each([320, 600, 840])('loads calendar data concurrently with the shared loading grid at %i while the profile resolves', (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11));
    state.profile = undefined;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });

    expect(state.calendarDataCalls).toHaveBeenCalledTimes(1);
    expect(calendarGridProps.current).toMatchObject({ isLoading: true, selectedDay: null });
    expect(tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-grid',
    )).toHaveLength(35);
    const gridShapes = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'skeleton-grid-shape',
    );
    for (const shape of gridShapes) expect(StyleSheet.flatten(shape.props.style)).toMatchObject({ width: 44, height: 44 });
  });

  it.each([
    ['Monday-first five-row', new Date(2026, 8, 11), 1, 5],
    ['Monday-first six-row', new Date(2026, 7, 11), 1, 6],
    ['Sunday-first six-row', new Date(2026, 4, 11), 0, 6],
  ] as const)('keeps the %s profile-loading grid at the loaded month height', (_label, now, weekStartDay, expectedRows) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    state.profile = undefined;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const loadingRegion = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar' && typeof StyleSheet.flatten(node.props.style)?.rowGap === 'number',
    )[0]!;
    expect(loadingRegion).toBeDefined();
    const loadingRowsRendered = React.Children.count(loadingRegion.props.children);

    state.profile = { weekStartDay, timeZone: "UTC", hasProAccess: false };
    TestRenderer.act(() => { tree.update(<CalendarScreen />); });
    const flatList = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'FlatList',
    )[0]!;
    TestRenderer.act(() => { TestRenderer.create(flatList.props.ListHeaderComponent); });
    const loadedRows = (calendarGridProps.current?.gridDays as unknown[]).length / 7;
    const ActualCalendarGrid = calendarGridProps.actual!;
    let gridTree!: import('react-test-renderer').ReactTestRenderer;
    TestRenderer.act(() => {
      gridTree = TestRenderer.create(
        <ActualCalendarGrid
          {...(calendarGridProps.current! as React.ComponentProps<CalendarGridComponent>)}
        />,
      );
    });
    const loadedDayGrid = gridTree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'month-grid-days',
    )[0]!;
    const loadedHeight = (loadedDayGrid.props.style as { minHeight: number }).minHeight;

    expect(loadedRows).toBe(expectedRows);
    const loadingRows = buildCalendarMonthModel(new Date(now.getFullYear(), now.getMonth(), 1), new Map(), 1, formatAPIDate(now)).gridDays.length / 7;
    expect(loadingRowsRendered).toBe(loadingRows);
    expect(loadedHeight).toBeUndefined();
    TestRenderer.act(() => gridTree.update(<></>));
  });

  it('shows a retryable error when the profile request fails', () => {
    state.profile = undefined;
    state.profileError = new Error('profile unavailable');
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });

    expect(hostTexts(tree)).toContain('calendar.loadError');
    const retry = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.testID === 'button-ghost-sm',
    );
    expect(retry).toHaveLength(1);
    TestRenderer.act(() => { retry[0]!.props.onPress(); });
    expect(state.profileRefetch).toHaveBeenCalledTimes(1);
  });

  it("switches to the week time-grid when the week tab is selected", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-time-grid",
      ),
    ).toHaveLength(0);

    pressView(tree!, "week");

    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.testID === "calendar-time-grid",
      ),
    ).toHaveLength(1);
    const timed = tree!.root.findAll((node) => node.type === "Pressable" && node.props.testID === "time-grid-event");
    expect(timed).toHaveLength(2);
    expect(timed.map((node) => node.props.accessibilityLabel).join(' ')).toContain("OneTime");
    TestRenderer.act(() => timed[0]!.props.onPress());
    expect(hostTexts(tree!)).toContain("Recurring");
  });

  it("hides recurring habits from the week grid when show-recurring is turned off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
    state.rangeMap = new Map([
      [
        getMockAccountDateKey(),
        [
          makeEntry({ habitId: "r", title: "Recurring", isOneTime: false }),
          makeEntry({ habitId: "o", title: "OneTime", isOneTime: true }),
        ],
      ],
    ]);
    let tree!: Tree;
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(<CalendarScreen />);
      });

      pressView(tree, "week");
      const timed = tree.root.findAll((node) => node.type === "Pressable" && node.props.testID === "time-grid-event");
      expect(timed).toHaveLength(2);

      const switches = tree.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.accessibilityRole === "switch",
      );
      expect(switches).toHaveLength(0);
      toggleRecurring(tree);

      const filtered = tree.root.findAll((node) => node.type === "Pressable" && node.props.testID === "time-grid-event");
      expect(filtered).toHaveLength(1);
      TestRenderer.act(() => filtered[0]!.props.onPress());
      expect(hostTexts(tree)).not.toContain("Recurring");
      expect(hostTexts(tree)).toContain("OneTime");
      const dismiss = tree.root.findAll((node) => node.type === "Pressable" && node.props.accessibilityLabel === "attempt-dismiss")[0]!;
      TestRenderer.act(() => dismiss.props.onPress());

      pressView(tree, "agenda");
      expect(hostTexts(tree)).not.toContain("Recurring");
      expect(hostTexts(tree)).toContain("OneTime");
    } finally {
      TestRenderer.act(() => tree.update(<></>));
      vi.useRealTimers();
    }
  });

  it("removes recurring habits from the month and shows its honest empty state", () => {
    const todayStr = getMockAccountDateKey();
    state.monthMap = new Map([[todayStr, [
      makeEntry({ habitId: "r", title: "Recurring", isOneTime: false }),
    ]]]);
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const flatList = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });

    expect(tree!.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "switch",
    )).toHaveLength(0);
    const switches = headerTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "switch",
    );
    expect(switches).toHaveLength(0);

    let initialFooterTree!: Tree;
    TestRenderer.act(() => {
      initialFooterTree = TestRenderer.create(flatList.props.ListFooterComponent);
    });
    expect(initialFooterTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-stats",
    )).toHaveLength(1);

    toggleRecurring(tree!);

    const updatedFlatList = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    TestRenderer.act(() => {
      headerTree.update(updatedFlatList.props.ListHeaderComponent);
    });
    expect(calendarGridProps.current?.gridDays.find(
      (day: { dateStr: string }) => day.dateStr === todayStr,
    )?.totalCount).toBe(0);
    let updatedFooterTree!: Tree;
    TestRenderer.act(() => {
      updatedFooterTree = TestRenderer.create(updatedFlatList.props.ListFooterComponent);
    });
    expect(updatedFooterTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-stats",
    )).toHaveLength(1);
    expect(calendarGridProps.stats?.state).toBe("empty");
    expect(hostTexts(headerTree)).toContain("calendar.emptyMonth");
  });

  it("matches web by paging a 61px by 45px drag after the 60px boundary", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });
    const flatList = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: import("react-test-renderer").ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });
    const initialMonth = state.calendarDataCalls.mock.calls.at(-1)?.[0] as Date;
    const initialCallCount = state.calendarDataCalls.mock.calls.length;
    const swipeGesture = calendarGridProps.current?.swipeGesture;

    TestRenderer.act(() => swipeGesture.fire(-59));
    expect(state.calendarDataCalls).toHaveBeenCalledTimes(initialCallCount);

    TestRenderer.act(() => swipeGesture.fire(-61, 45));
    expect((state.calendarDataCalls.mock.calls.at(-1)?.[0] as Date).getMonth())
      .toBe((initialMonth.getMonth() + 1) % 12);

    TestRenderer.act(() => {
      headerTree.update(flatList.props.ListHeaderComponent);
    });
    TestRenderer.act(() => calendarGridProps.current?.swipeGesture.fire(61, 45));
    expect((state.calendarDataCalls.mock.calls.at(-1)?.[0] as Date).getMonth())
      .toBe(initialMonth.getMonth());
  });

  it("states a fourteen-day span and pages by the whole span", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree!, "range");

    expect(hostTexts(tree!).some((text) =>
      typeof text === "string" && text.startsWith("calendar.range.label:") && text.includes('"start"') && text.includes('"end"'),
    )).toBe(true);
    const beforePage = state.calendarRangeCalls.mock.calls.at(-1)!;
    const previous = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "button" &&
        node.props.accessibilityLabel === "calendar.range.previous",
    )[0]!;
    TestRenderer.act(() => previous.props.onPress());
    const afterPage = state.calendarRangeCalls.mock.calls.at(-1)!;
    expect(differenceInCalendarDays(beforePage[1], beforePage[0])).toBe(13);
    expect(differenceInCalendarDays(beforePage[1], afterPage[1])).toBe(14);
  });

  it("renders fourteen range days as read-only cells with span figures", () => {
    const today = parseAPIDate(getMockAccountDateKey());
    state.rangeMap = new Map([
      [formatAPIDate(addDays(today, -1)), [makeEntry({ status: "completed" })]],
      [formatAPIDate(today), [makeEntry({ status: "missed" })]],
    ]);
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree!, "range");
    const rangeDays = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        typeof node.props.testID === "string" &&
        node.props.testID.startsWith("day-cell-"),
    );
    expect(rangeDays).toHaveLength(14);
    for (const day of rangeDays) {
      expect(day.props.accessibilityRole).toBe("image");
      expect(day.props.onPress).toBeUndefined();
    }
    expect(calendarStatsProps.current?.stats.map((stat) => stat.value)).toEqual([1, 1, 1]);
  });

  it("keeps the pending range busy without exposing empty outcomes, then reveals the resolved span", () => {
    state.rangeLoading = true;
    let tree!: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    pressView(tree, "range");
    const loadingGrid = tree.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.testID === "skeleton-unit-grid" &&
        node.props.accessibilityRole === "progressbar",
    );
    expect(loadingGrid).toHaveLength(1);
    expect(loadingGrid[0]!.props.accessibilityRole).toBe("progressbar");
    expect(loadingGrid[0]!.props.accessibilityState).toEqual({ busy: true });
    expect(tree.root.findAll(
      (node) => typeof node.type === "string" && typeof node.props.testID === "string" && node.props.testID.startsWith("day-cell-"),
    )).toHaveLength(0);
    expect(calendarStatsProps.current?.state).toBe("loading");

    state.rangeLoading = false;
    TestRenderer.act(() => {
      tree.update(<CalendarScreen />);
    });

    expect(tree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "skeleton-unit-grid",
    )).toHaveLength(0);
    expect(tree.root.findAll(
      (node) => typeof node.type === "string" && typeof node.props.testID === "string" && node.props.testID.startsWith("day-cell-"),
    )).toHaveLength(14);
    expect(calendarStatsProps.current?.state ?? "default").toBe("default");
  });

  it("keeps the calendar usable and offers habit creation for an empty current month", () => {
    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    const flatLists = tree!.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    );
    expect(flatLists).toHaveLength(1);

    let headerTree: import('react-test-renderer').ReactTestRenderer;
    let footerTree: Tree;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(
        flatLists[0]!.props.ListHeaderComponent,
      );
      footerTree = TestRenderer.create(
        flatLists[0]!.props.ListFooterComponent,
      );
    });

    expect(hostTexts(headerTree!)).toContain("calendar.emptyMonth");
    expect(calendarGridProps.current).not.toBeNull();
    expect(calendarGridProps.stats?.state).toBe("empty");
    expect(headerTree!.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-legend",
    )).toHaveLength(0);
    const feedback = headerTree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-month-empty')[0]!;
    const buttons = feedback.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "button",
    );
    expect(buttons).toHaveLength(1);
    const onPress = buttons[0]!.props.onPress;
    if (typeof onPress !== 'function') throw new Error('Expected habit creation action');
    TestRenderer.act(() => onPress());
    expect(state.routerPush).toHaveBeenCalledWith(buildHabitCreateHref({ from: '/calendar' }));
    expect(state.setShowCreateModal).not.toHaveBeenCalled();
  });

  it("keeps paging but removes creation for a future month", () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    let flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: import('react-test-renderer').ReactTestRenderer;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });
    TestRenderer.act(() => { calendarGridProps.header!.onNextMonth(); });
    flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
    });

    expect(hostTexts(headerTree)).toContain("calendar.futureMonth");
    expect(calendarGridProps.current).not.toBeNull();
    const feedback = headerTree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-month-empty')[0]!;
    expect(feedback.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "button",
    )).toHaveLength(0);
  });

  it("keeps compact loading shaped like the grid and stat tiles", () => {
    state.monthLoading = true;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: Tree;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
      TestRenderer.create(flatList.props.ListFooterComponent);
    });

    expect(calendarGridProps.current?.isLoading).toBe(true);
    expect(headerTree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-day-skeleton')).toHaveLength(1);
    expect(calendarGridProps.stats?.state).toBe("loading");
    expect(headerTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-day-loading",
    )).toHaveLength(0);
  });

  describe.each(['UTC', 'America/Sao_Paulo', 'Pacific/Auckland'])('selected day headings in %s', (timeZone) => {
    it.each([
      ['en', 'Today, September 30', 'Tuesday, September 29'],
      ['pt-BR', 'Hoje, 30 de setembro', 'Terça-feira, 29 de setembro'],
    ])('renders the drawn selected day headings in %s', (locale, todayTitle, otherTitle) => {
      const originalTimeZone = process.env.TZ;
      process.env.TZ = timeZone;
      vi.setSystemTime(new Date(2026, 8, 30, 12));
      state.language = locale;
      state.profile = { weekStartDay: 1, timeZone, hasProAccess: false };
      let tree: Tree | undefined;
      let header: Tree | undefined;
      try {
        TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
        const mountedTree = tree!;
        const mountedHeader = renderMonthHeader(mountedTree);
        header = mountedHeader;
        expect(calendarDayDetailProps.current?.title).toBe(todayTitle);
        TestRenderer.act(() => { calendarGridProps.current!.onSelectDay('2026-09-29'); });
        const flatList = mountedTree.root.findAll((node) => node.type === 'FlatList')[0]!;
        TestRenderer.act(() => { mountedHeader.update(flatList.props.ListHeaderComponent); });
        expect(calendarDayDetailProps.current?.title).toBe(otherTitle);
        TestRenderer.act(() => mountedHeader.update(<></>));
        pressView(mountedTree, 'week');
        const week = mountedTree.root.findAll((node) => typeof node.type === 'function' && node.type.name === 'CalendarWeekView')[0]!;
        TestRenderer.act(() => { week.props.onSelectDay('2026-09-30'); });
        expect(mountedTree.root.findAll((node) => node.type === 'Sheet' && node.props.title === todayTitle)).toHaveLength(1);
      } finally {
        TestRenderer.act(() => { header?.update(<></>); tree?.update(<></>); });
        if (originalTimeZone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimeZone;
      }
    });
  });

  it('keeps a selected month day inline below the grid without a sheet', () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const header = renderMonthHeader(tree);
    expect(header.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-header-group')).toHaveLength(1);
    expect(header.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-day-detail')).toHaveLength(1);

    const selected = '2026-09-10';
    TestRenderer.act(() => { calendarGridProps.current!.onSelectDay(selected); });
    const flatList = tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'FlatList')[0]!;
    TestRenderer.act(() => { header.update(flatList.props.ListHeaderComponent); });
    expect(calendarDayDetailProps.current?.selectedDate).toBe(selected);
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'Sheet')).toHaveLength(0);
    TestRenderer.act(() => header.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it('opens a sheet for a selected week day', () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    pressView(tree, 'week');
    const week = tree.root.findAll((node) => typeof node.type === 'function' && node.type.name === 'CalendarWeekView')[0];
    expect(week).toBeDefined();
    TestRenderer.act(() => { week!.props.onSelectDay('2026-09-10'); });
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'Sheet')).toHaveLength(1);
    expect(calendarDayDetailProps.current?.selectedDate).toBe('2026-09-10');
    TestRenderer.act(() => tree.update(<></>));
  });

  it.each(['events', 'habit'])('closes the week day sheet before opening %s disclosure', (disclosure) => {
    state.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true };
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    pressView(tree, 'week');
    const week = tree.root.findAll((node) => typeof node.type === 'function' && node.type.name === 'CalendarWeekView')[0]!;
    TestRenderer.act(() => { week.props.onSelectDay('2026-09-10'); });
    sheetTestControls.defer(true);
    try {
      TestRenderer.act(() => {
        if (disclosure === 'events') calendarDayDetailProps.current!.onOpenEvents?.();
        else calendarDayDetailProps.current!.onOpenHabitTitle?.('Long habit title');
      });
      expect(sheetTestControls.isDismissPending).toBe(true);
      expect(tree.root.findAll((node) => node.type === 'Sheet' && node.props.open)).toHaveLength(0);
      TestRenderer.act(() => { sheetTestControls.completeDismissal(); });
      const sheets = tree.root.findAll((node) => node.type === 'Sheet');
      expect(sheets).toHaveLength(1);
      expect(sheets[0]!.props.title).toBe(disclosure === 'events' ? 'calendar.dayDetail.eventsTitle' : 'habits.form.title');
      TestRenderer.act(() => { tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss')[0]!.props.onPress(); });
      TestRenderer.act(() => { sheetTestControls.completeDismissal(); });
      TestRenderer.act(() => { week.props.onSelectDay('2026-09-10'); });
      expect(calendarDayDetailProps.current?.selectedDate).toBe('2026-09-10');
    } finally { sheetTestControls.defer(false); TestRenderer.act(() => { tree.update(<></>); }); }
  });

  it('returns from a later week to the month containing the selected day', () => {
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    pressView(tree, 'week');
    for (let week = 0; week < 4; week += 1) {
      const nextWeek = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'common.nextWeek')[0]!;
      TestRenderer.act(() => { nextWeek.props.onPress(); });
    }
    const weekView = tree.root.findAll((node) => typeof node.type === 'function' && node.type.name === 'CalendarWeekView')[0]!;
    const selected = weekView.props.columns[3].dateStr as string;
    expect(selected).toBe('2026-10-08');
    TestRenderer.act(() => { weekView.props.onSelectDay(selected); });
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'Sheet')).toHaveLength(1);

    pressView(tree, 'month');
    const header = renderMonthHeader(tree);
    expect(formatAPIDate(state.calendarDataCalls.mock.lastCall![0])).toBe('2026-10-01');
    expect(calendarGridProps.current!.gridDays.find((day: { dateStr: string }) => day.dateStr === selected)?.isCurrentMonth).toBe(true);
    expect(calendarGridProps.current!.selectedDay).toBe(selected);
    expect(calendarDayDetailProps.current?.selectedDate).toBe(selected);
    TestRenderer.act(() => header.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it('keeps the month skeleton and tiles in one list while loading', () => {
    state.monthLoading = true;
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const header = renderMonthHeader(tree);
    const footer = renderMonthFooter(tree);
    expect(calendarGridProps.current?.isLoading).toBe(true);
    expect(header.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-day-skeleton')).toHaveLength(1);
    expect(header.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-day-detail')).toHaveLength(0);
    expect(calendarStatsProps.current?.state).toBe('loading');
    state.monthLoading = false;
    TestRenderer.act(() => { tree.update(<CalendarScreen />); });
    const flatList = tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'FlatList')[0]!;
    TestRenderer.act(() => { header.update(flatList.props.ListHeaderComponent); });
    TestRenderer.act(() => { footer.update(flatList.props.ListFooterComponent); });
    expect(calendarGridProps.current?.isLoading).toBe(false);
    expect(header.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-day-skeleton')).toHaveLength(0);
    expect(header.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-day-detail')).toHaveLength(1);
    TestRenderer.act(() => header.update(<></>));
    TestRenderer.act(() => footer.update(<></>));
    TestRenderer.act(() => tree.update(<></>));
  });

  it("shows the legend once the month has a scheduled entry", () => {
    state.monthMap = new Map([[getMockAccountDateKey(), [makeEntry({})]]]);
    let tree!: Tree;
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />); });
    const flatList = tree.root.findAll(
      (node) => typeof node.type === "string" && node.type === "FlatList",
    )[0]!;
    let headerTree!: Tree;
    TestRenderer.act(() => {
      headerTree = TestRenderer.create(flatList.props.ListHeaderComponent);
      TestRenderer.create(flatList.props.ListFooterComponent);
    });

    expect(headerTree.root.findAll(
      (node) => typeof node.type === "string" && node.props.testID === "calendar-legend",
    )).toHaveLength(0);
    expect(calendarGridProps.stats?.state).toBe("default");
  });

  it("shows a retryable error card when the calendar query fails", () => {
    state.monthError = "network down";
    const refreshCalls: number[] = [];
    state.monthRefresh = () => {
      refreshCalls.push(1);
    };

    let tree: Tree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />);
    });

    expect(state.setCalendarHasError).toHaveBeenCalledWith(true);
    expect(hostTexts(tree!)).toContain("calendar.loadError");

    const retryButtons = tree!.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "button" && node.props.testID === "button-ghost-sm",
    );
    expect(retryButtons).toHaveLength(1);
    TestRenderer.act(() => {
      retryButtons[0]!.props.onPress();
    });
    expect(refreshCalls).toHaveLength(1);
  });
  it.each(['profile-loading', 'profile-error', 'data-error'] as const)('scrolls the Calendar %s surface on reselect', (surface) => {
    if (surface !== 'data-error') state.profile = undefined
    if (surface === 'profile-error') state.profileError = new Error('Unavailable')
    if (surface === 'data-error') state.monthError = 'Unavailable'
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<RootScrollProvider><CalendarScreen /><DestinationTabBar pathname="/calendar" /></RootScrollProvider>) })
    scrollTo.mockClear()
    rootScrollMocks.scrollToOffset.mockClear()
    TestRenderer.act(() => { tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'tab' && node.props.accessibilityState?.selected)[0]!.props.onPress() })
    expect(rootScrollMocks.scrollToOffset).toHaveBeenCalledExactlyOnceWith({ offset: 0, animated: false })
    TestRenderer.act(() => tree.unmount())
    __setScrollToImpl(() => {})
  })

  it.each(['month', 'week', 'agenda', 'range'] as const)('scrolls the Calendar root in %s without changing the view', (view) => {
    const scrollTo = vi.fn()
    rootScrollMocks.scrollToOffset.mockClear()
    __setScrollToImpl(scrollTo)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<RootScrollProvider><CalendarScreen /><DestinationTabBar pathname="/calendar" /></RootScrollProvider>) })
    if (view !== 'month') pressView(tree, view)
    scrollTo.mockClear()
    rootScrollMocks.scrollToOffset.mockClear()
    TestRenderer.act(() => { tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'tab' && node.props.accessibilityState?.selected)[0]!.props.onPress() })
    if (view === 'month') expect(rootScrollMocks.scrollToOffset).toHaveBeenCalledExactlyOnceWith({ offset: 0, animated: false })
    else expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 0, animated: false })
    const header = view === 'month' ? renderMonthHeader(tree) : null
    expect((header ?? tree).root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.testID === `segment-${view}-selected-enabled`)).toHaveLength(1)
    if (header) TestRenderer.act(() => header.update(<></>))
    TestRenderer.act(() => tree.unmount())
    __setScrollToImpl(() => {})
  })

});

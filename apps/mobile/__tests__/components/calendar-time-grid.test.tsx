import * as ReactNative from 'react-native'
import React from "react";
import { createRequire } from 'node:module';
import type { LegacyHoverGesture as HoverGesture, GestureStateChangeEvent } from 'react-native-gesture-handler';
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable';
import { afterEach, describe, it, expect, vi } from "vitest";
import { StyleSheet } from "react-native";
import { INTERACTION_FILL_CLEARANCE } from "@orbit/shared/theme";
import { Resvg } from '@resvg/resvg-js';
import en from '@orbit/shared/i18n/en.json';
import ptBR from '@orbit/shared/i18n/pt-BR.json';
import { __focusHost, __getFocusedNativeTag, __setTouchMode, __setScrollToImpl } from "../../test-mocks/react-native";
import { usePrefersReducedMotion } from "@/lib/motion";
import { CalendarEntryDetails } from "@/app/(tabs)/calendar/_components/calendar-entry-details";
import { sheetTestControls } from "@/__tests__/support/sheet-double";
import type { TFunction } from "i18next";
import type { CalendarDayEntry } from "@orbit/shared/types/calendar";

import { contrastOnSurface } from '@orbit/shared/__tests__/contrast';
import { createTokensV2, setRuntimeTheme, getRuntimeTheme, createSurfaces, radius, shadows } from "@/lib/theme";
import {
  CalendarTimeGrid,
  type TimeGridColumn,
} from "@/app/(tabs)/calendar/_components/calendar-time-grid";

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => {
  const { scheme, themeMode } = getRuntimeTheme();
  return { currentScheme: scheme, currentTheme: themeMode, surfaces: createSurfaces(scheme, themeMode), radius, shadows, applyTheme: vi.fn(), toggleTheme: vi.fn() };
} }));

vi.mock("@/lib/motion", () => ({ usePrefersReducedMotion: vi.fn(() => false) }));

const TestRenderer = require("react-test-renderer");

const loadGestureModule = createRequire(import.meta.url);
const { HoverGesture: InstalledHoverGesture } = await vi.importActual<{ HoverGesture: new () => HoverGesture }>(loadGestureModule.resolve('react-native-gesture-handler/lib/module/handlers/gestures/hoverGesture.js'));
const { findHandler } = await vi.importActual<{ findHandler: (tag: number) => HoverGesture | undefined }>(loadGestureModule.resolve('react-native-gesture-handler/lib/module/handlers/handlersRegistry.js'));
const { State } = await vi.importActual<typeof import('react-native-gesture-handler/lib/typescript/State')>(loadGestureModule.resolve('react-native-gesture-handler/lib/module/State.js'));
const { PointerType } = await vi.importActual<typeof import('react-native-gesture-handler/lib/typescript/PointerType')>(loadGestureModule.resolve('react-native-gesture-handler/lib/module/PointerType.js'));

const { onGestureHandlerEvent } = await vi.importActual<{ onGestureHandlerEvent: (event: GestureStateChangeEvent) => void }>(loadGestureModule.resolve('react-native-gesture-handler/lib/module/handlers/gestures/eventReceiver.js'));

function attachedHeaderHover(header: TestNode): HoverGesture {
  let detector = header.parent;
  while (detector && typeof detector.type !== 'string') detector = detector.parent;
  expect(detector?.type, 'the native hover detector must wrap this header control').toBe('GestureDetector');
  const child = React.Children.only(detector!.props.children) as React.ReactElement<{ testID?: string; collapsable?: boolean }>;
  expect(child.type, 'hover must attach to the full header control').toBe(InsetFocusPressable);
  expect(child.props.testID).toBe('time-grid-col-header');
  expect(header.props.collapsable).toBe(false);
  const gesture = detector!.props.gesture as HoverGesture;
  expect(gesture).toBeInstanceOf(InstalledHoverGesture);
  expect(gesture.handlerName).toBe('HoverGestureHandler');
  expect(gesture.config).toMatchObject({ manualActivation: true, cancelsTouchesInView: false, runOnJS: true });
  expect(findHandler(gesture.handlerTag)).toBe(gesture);
  return gesture;
}

function deliverHover(gesture: HoverGesture, state: typeof State[keyof typeof State], oldState: typeof State[keyof typeof State]) {
  TestRenderer.act(() => onGestureHandlerEvent({
    handlerTag: gesture.handlerTag, numberOfPointers: 1, pointerType: PointerType.MOUSE,
    x: 24, y: 16, absoluteX: 72, absoluteY: 32, state, oldState,
  }));
}


type TestNode = {
  type: unknown;
  props: Record<string, any>;
  parent?: TestNode | null;
};
type Tree = {
  update: (element: React.ReactNode) => void;
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
};

function makeEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: "1",
    title: "Meditate",
    status: "upcoming",
    isBadHabit: false,
    dueTime: null,
    isOneTime: false,
    ...overrides,
  };
}

function column(dateStr: string, isFuture = false): TimeGridColumn {
  return {
    date: new Date(`${dateStr}T00:00:00`),
    dateStr,
    isToday: false,
    isFuture,
  };
}

const mounted: Tree[] = [];
afterEach(() => { TestRenderer.act(() => { for (const tree of mounted) tree.update(<></>); }); mounted.length = 0; setRuntimeTheme({ themeMode: 'dark' }); vi.restoreAllMocks(); vi.mocked(usePrefersReducedMotion).mockReturnValue(false); __setTouchMode(true); sheetTestControls.defer(false); });

const displayTime = (time: string) => time;
const tokens = createTokensV2("purple", "dark");
const translate = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as TFunction;

function renderGrid(
  columns: TimeGridColumn[],
  dayMap: Map<string, CalendarDayEntry[]>,
  onSelectDay = vi.fn(),
  isLoading = false,
  formatTime = displayTime,
  timeZone: string | null = "UTC",
  gridTokens = tokens,
  language = 'en',
  allDayLabel = en.calendar.timeGrid.noSetTime,
): Tree {
  let tree: Tree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <CalendarTimeGrid
        columns={columns}
        dayMap={dayMap}
        onSelectDay={onSelectDay}
        displayTime={formatTime}
        language={language}
        allDayLabel={allDayLabel}
        nowLabel="Now"
        isLoading={isLoading}
        t={translate}
        tokens={gridTokens}
        timeZone={timeZone}
      />,
    );
  });
  mounted.push(tree!);
  return tree!;
}

function hostsByTestID(tree: Tree, testID: string): TestNode[] {
  return tree.root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === testID,
  );
}

function textValuesWithin(tree: Tree, testID: string): unknown[] {
  return hostsByTestID(tree, testID).flatMap((node) =>
    collectText(node as unknown as { props: { children?: unknown } }),
  );
}

function collectText(node: { props?: { children?: unknown } }): unknown[] {
  const children = node.props?.children;
  if (children == null) return [];
  const list = Array.isArray(children) ? children : [children];
  return list.flatMap((child) => {
    if (typeof child === "string" || typeof child === "number") return [child];
    if (Array.isArray(child)) return collectText({ props: { children: child } });
    if (child && typeof child === "object" && "props" in child) {
      return collectText(child as { props: { children?: unknown } });
    }
    return [];
  });
}

function resolveStyle(style: unknown): Record<string, unknown> {
  const value = typeof style === "function" ? style({ pressed: false }) : style;
  return (StyleSheet.flatten(value) ?? {}) as Record<string, unknown>;
}

function hostParent(node: TestNode): TestNode {
  let parent = node.parent!;
  while (typeof parent.type !== 'string') parent = parent.parent!;
  return parent;
}

function renderedAncestorHeight(node: TestNode): number | undefined {
  let ancestor = node.parent;
  while (ancestor) {
    const style = resolveStyle(ancestor.props.style);
    const height = style.minHeight ?? style.height;
    if (typeof height === "number") return height;
    ancestor = ancestor.parent;
  }
  return undefined;
}

describe("CalendarTimeGrid (mobile)", () => {
  it.each([320, 412, 600, 1024, 1352])('insets every pressed week header fill from its cell edges at %ipx', (width) => {
    vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale: 1 });
    const columns = Array.from({ length: 7 }, (_, index) => column(`2026-10-${String(5 + index).padStart(2, '0')}`));
    const tree = renderGrid(columns, new Map(columns.map(({ dateStr }) => [dateStr, [makeEntry()]])));
    for (const header of hostsByTestID(tree, 'time-grid-col-header')) {
      const target = StyleSheet.flatten(header.props.style({ pressed: true }));
      expect(target.backgroundColor ?? 'transparent').toBe('transparent');
      expect(Number(target.borderRadius)).toBeGreaterThan(0);
      TestRenderer.act(() => header.props.onPressIn?.());
      const fill = hostsByTestID(tree, 'time-grid-col-header-fill').find((candidate) => {
        for (let parent = candidate.parent; parent; parent = parent.parent) if (parent === header) return true;
        return false;
      });
      expect(fill).toBeDefined();
      const painted = resolveStyle(fill!.props.style);
      expect(painted.backgroundColor).toBe(tokens.bgHover);
      expect(painted.borderRadius).toBe(target.borderRadius);
      expect(painted.position).toBe('absolute');
      for (const [edge, border] of [['top', 'borderTopWidth'], ['right', 'borderRightWidth'], ['bottom', 'borderBottomWidth'], ['left', 'borderLeftWidth']] as const) {
        expect(Number(painted[edge]) + Number(target[border] ?? target.borderWidth ?? 0)).toBe(INTERACTION_FILL_CLEARANCE);
      }
      TestRenderer.act(() => header.props.onPressOut?.());
    }
  });

  it.each(['light', 'dark'] as const)('paints week header focus and clears it on blur in %s mode', (mode) => {
    setRuntimeTheme({ themeMode: mode });
    const palette = createTokensV2('purple', mode);
    const tree = renderGrid([column('2026-10-05')], new Map(), vi.fn(), false, displayTime, 'UTC', palette);
    const header = hostsByTestID(tree, 'time-grid-col-header')[0]!;
    const fillStyle = () => resolveStyle(hostsByTestID(tree, 'time-grid-col-header-fill')[0]!.props.style);
    const focusEvent = { target: 1, currentTarget: 1 };
    expect(fillStyle().backgroundColor).toBe('transparent');
    TestRenderer.act(() => header.props.onFocus(focusEvent));
    expect(fillStyle().backgroundColor).toBe(palette.bgHover);
    const ring = tree.root.findAll((node) => typeof node.type === 'string' && resolveStyle(node.props.style).outlineStyle === 'solid')[0]!;
    const outline = resolveStyle(ring.props.style);
    expect(-Number(outline.outlineOffset) - Number(outline.outlineWidth)).toBe(INTERACTION_FILL_CLEARANCE);
    TestRenderer.act(() => header.props.onPressIn());
    TestRenderer.act(() => header.props.onPressOut());
    expect(fillStyle().backgroundColor).toBe(palette.bgHover);
    TestRenderer.act(() => header.props.onBlur(focusEvent));
    expect(fillStyle().backgroundColor).toBe('transparent');
  });

  it.each([412, 600, 1100, 1352].flatMap((width) => ['en', 'pt-BR'].map((language) => ({ width, language }))))('keeps drawn week columns and complete short names in $language at $width', ({ width, language }) => {
    const title = language === 'pt-BR' ? 'Revisar notas' : 'Review notes';
    const words = language === 'pt-BR' ? ptBR : en;
    const columns = Array.from({ length: 7 }, (_, index) => column(`2026-10-${String(5 + index).padStart(2, '0')}`));
    for (const { fontScale, laneCount } of [1, 2].flatMap((fontScale) => [1, 2, 3].map((laneCount) => ({ fontScale, laneCount })))) {
      vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale });
      const entries = [
        ...Array.from({ length: laneCount }, (_, index) => makeEntry({ habitId: `timed-${index}`, title, dueTime: '08:00' })),
        makeEntry({ habitId: 'short-chip', title }),
        makeEntry({ habitId: 'long-chip', title: 'Sweep-Supercalifragilisticexpialidocious-Token-Habit' }),
      ];
      const tree = renderGrid(columns, new Map(columns.map(({ dateStr }) => [dateStr, entries])), vi.fn(), false, displayTime, 'UTC', tokens, language, words.calendar.timeGrid.noSetTime);
      const horizontal = tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      const viewportWidth = width - 32 - 96;
      TestRenderer.act(() => horizontal.props.onLayout({ nativeEvent: { layout: { width: viewportWidth, height: 400 } } }));
      const expectedWidth = Math.max(192, laneCount * 96) * fontScale;
      for (const testID of ['time-grid-col-header', 'time-grid-all-day', 'time-grid-day-column']) {
        const hosts = hostsByTestID(tree, testID);
        expect(hosts).toHaveLength(7);
        for (const host of hosts) expect(resolveStyle(host.props.style).width).toBe(expectedWidth);
      }
      expect(7 * expectedWidth).toBeGreaterThan(viewportWidth);
      expect(horizontal.props.showsHorizontalScrollIndicator).toBe(true);
      const label = hostsByTestID(tree, 'time-grid-any-time-label')[0]!;
      const gutter = hostParent(hostParent(hostParent(hostParent(label))));
      if (fontScale === 1) expect(resolveStyle(gutter.props.style).width).toBe(96);
      else expect(Number(resolveStyle(gutter.props.style).width)).toBeGreaterThanOrEqual(96);
      expect(gutter.props.children.type).toBe(ReactNative.ScrollView);
      expect(gutter.props.children.props.scrollEnabled).toBe(false);
      const font = require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="64"><text y="32" font-family="Geist" font-size="${12 * fontScale}">${title}</text></svg>`;
      const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!;
      for (const block of hostsByTestID(tree, 'time-grid-event')) {
        const style = resolveStyle(block.props.style);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(Number(style.width) - 2 * Number(style.paddingHorizontal) - 2 * Number(style.borderWidth));
      }
      const cellStyle = resolveStyle(hostsByTestID(tree, 'time-grid-all-day')[0]!.props.style);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(expectedWidth - 2 * Number(cellStyle.paddingHorizontal) - Number(cellStyle.borderLeftWidth) - 18);
    }
  });

  for (const [language, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    it.each([320, 360, 384, 412, 1352])(`fits the ${language} any-time label on one line at font scale 1 and %ipx`, (width) => {
      vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale: 1 });
      const day = column('2026-10-05');
      const entries = [null, null, null, '08:00', '21:00'].map((dueTime, index) => makeEntry({ habitId: `label-fit-${index}`, dueTime, title: `Organizar as anotações e preparar a semana ${index}` }));
      const tree = renderGrid([day], new Map([[day.dateStr, entries]]), vi.fn(), false, displayTime, 'UTC', tokens, language, words.calendar.timeGrid.noSetTime);
      const label = hostsByTestID(tree, 'time-grid-any-time-label')[0]!;
      const labelStyle = resolveStyle(label.props.style);
      const cell = hostParent(label);
      const cellStyle = resolveStyle(cell.props.style);
      const gutterStyle = resolveStyle(hostParent(hostParent(hostParent(cell))).props.style);
      const font = require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="64"><text y="32" font-family="Geist" font-size="${Number(labelStyle.fontSize)}">${label.props.children}</text></svg>`;
      const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!;
      const available = Number(gutterStyle.width) - Number(cellStyle.padding) * 2;
      expect(labelStyle.fontFamily).toBe('Geist_400Regular');
      expect(labelStyle.fontSize).toBe(12);
      expect(label.props.children).toBe(words.calendar.timeGrid.noSetTime);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(available);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.ellipsizeMode).toBeUndefined();
    });
  }

  it.each([['en', en], ['pt-BR', ptBR]] as const)('grows and aligns an empty %s any-time lane to the measured accessibility label', (language, words) => {
    vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 320, height: 915, scale: 1, fontScale: 2 });
    const tree = renderGrid([column('2026-10-05')], new Map(), vi.fn(), false, displayTime, 'UTC', tokens, language, words.calendar.timeGrid.noSetTime);
    const label = hostsByTestID(tree, 'time-grid-any-time-label')[0]!;
    TestRenderer.act(() => label.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 80, height: 120 } } }));
    const cell = hostParent(hostsByTestID(tree, 'time-grid-any-time-label')[0]!);
    const style = resolveStyle(cell.props.style);
    expect(style.height).toBeUndefined();
    expect(Number(style.minHeight)).toBeGreaterThanOrEqual(120 + Number(style.padding) * 2 + Number(style.borderBottomWidth));
    expect(renderedAncestorHeight(hostsByTestID(tree, 'time-grid-all-day')[0]!)).toBe(style.minHeight);
    expect(resolveStyle(hostParent(cell).props.style).height).toBeUndefined();
  });

  it.each(['light', 'dark'] as const)('keeps timed metadata readable on %s press', (mode) => {
    setRuntimeTheme({ themeMode: mode });
    const palette = createTokensV2('purple', mode);
    const col = column('2025-06-16');
    const tree = renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: '08:00' })]]]), vi.fn(), false, displayTime, 'UTC', palette);
    const block = hostsByTestID(tree, 'time-grid-event')[0]!;
    const time = () => tree.root.findAll((node) => {
      if (node.type !== 'Text' || node.props.children !== '08:00') return false;
      for (let parent = node.parent; parent; parent = parent.parent) if (parent === block) return true;
      return false;
    })[0]!;
    expect(resolveStyle(time().props.style).color).toBe(palette.fg3);
    TestRenderer.act(() => block.props.onPressIn());
    const fill = StyleSheet.flatten(block.props.style({ pressed: true })).backgroundColor;
    expect(contrastOnSurface(String(resolveStyle(time().props.style).color), [palette.bg, palette.bgCard, fill])).toBeGreaterThanOrEqual(4.5);
    TestRenderer.act(() => block.props.onPressOut());
    expect(resolveStyle(time().props.style).color).toBe(palette.fg3);
  });

  it.each(['light', 'dark'] as const)('keeps the today weekday readable on %s press', (mode) => {
    setRuntimeTheme({ themeMode: mode });
    const palette = createTokensV2('purple', mode);
    const col = { ...column('2025-06-16'), isToday: true };
    const tree = renderGrid([col], new Map(), vi.fn(), false, displayTime, 'UTC', palette);
    const header = hostsByTestID(tree, 'time-grid-col-header')[0]!;
    const weekday = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && resolveStyle(node.props.style).color === palette.fg2)[0]!;
    expect(resolveStyle(weekday.props.style).color).toBe(palette.fg2);
    TestRenderer.act(() => header.props.onPressIn?.());
    const fill = String(resolveStyle(hostsByTestID(tree, 'time-grid-col-header-fill')[0]!.props.style).backgroundColor);
    const color = String(resolveStyle(weekday.props.style).color);
    expect(fill).toBe(palette.bgHover);
    if (mode === 'light') expect(contrastOnSurface(color, [palette.bg, palette.bgCard, fill])).toBeGreaterThanOrEqual(4.5);
    else expect(color).toBe(palette.fg2);
    TestRenderer.act(() => header.props.onPressOut?.());
    expect(resolveStyle(weekday.props.style).color).toBe(palette.fg2);
  });

  it("grows the grid labels and padded column widths at 200% font scale", () => {
    vi.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({ width: 320, height: 915, scale: 1, fontScale: 2 });
    const col = column("2025-06-16");
    const tree = renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: '08:00' }), makeEntry({ habitId: 'untimed' })]]]), vi.fn(), false, (time) => `${time} AM`);
    expect(resolveStyle(hostsByTestID(tree, 'time-grid-col-header')[0]!.props.style).width).toBeGreaterThanOrEqual(104);
    expect(renderedAncestorHeight(hostsByTestID(tree, 'time-grid-col-header')[0]!)).toBeGreaterThanOrEqual(100);
    for (const label of hostsByTestID(tree, 'time-grid-hour-label')) expect(resolveStyle(label.props.style).fontSize).toBeGreaterThanOrEqual(12);
    const summaryStyle = resolveStyle(hostsByTestID(tree, 'time-grid-all-day-event')[0]!.props.style);
    const count = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === 'Meditate')[0]!;
    const cell = hostsByTestID(tree, 'time-grid-all-day')[0]!;
    const cellStyle = resolveStyle(cell.props.style);
    const textHeight = Number(resolveStyle(count.props.style).lineHeight) * 2;
    const summaryHeight = Math.max(Number(summaryStyle.minHeight), textHeight + 20);
    const requiredBandHeight = summaryHeight + Number(cellStyle.paddingVertical) * 2 + Number(cellStyle.borderBottomWidth);
    expect(renderedAncestorHeight(cell)).toBeGreaterThanOrEqual(requiredBandHeight);
  });

  it("places a timed habit as a block in its column", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "a", title: "Standup", dueTime: "08:00" })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(1);
    expect(resolveStyle(hostsByTestID(tree, "time-grid-event")[0]!.props.style)).toMatchObject({
      top: 384,
      width: 188,
      minHeight: 48,
    });
    expect(textValuesWithin(tree, "time-grid-event")).toContain("Standup");
    expect(hostsByTestID(tree, "time-grid-event")[0]!.props.accessibilityLabel).toContain("Standup");
  });

  it("places an untimed habit in the all-day band, not the time body", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "b", title: "Read", dueTime: null })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(0);
    expect(hostsByTestID(tree, "time-grid-all-day-event")).toHaveLength(1);
    expect(textValuesWithin(tree, "time-grid-all-day-event")).toContain("Read");
    expect(textValuesWithin(tree, "time-grid-any-time-label")).toContain("No set time");
  });

  it("keeps every concurrent timed-event lane at least 48px wide", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([[
      col.dateStr,
      [
        makeEntry({ habitId: "a", dueTime: "08:00" }),
        makeEntry({ habitId: "b", dueTime: "08:00" }),
      ],
    ]]);
    const tree = renderGrid([col], dayMap);

    const widths = hostsByTestID(tree, "time-grid-event").map(
      (event) => resolveStyle(event.props.style).width,
    );
    expect(widths).toEqual([92, 92]);
  });

  it("dims every future day column without lowering text contrast", () => {
    const tree = renderGrid([column("2025-06-18", true)], new Map());

    expect(resolveStyle(hostsByTestID(tree, "time-grid-col-date")[0]!.props.style)).toMatchObject({
      color: tokens.fg2,
    });
    expect(resolveStyle(hostsByTestID(tree, "time-grid-all-day")[0]!.props.style)).toMatchObject({
      borderLeftColor: tokens.hairlineGhost,
    });
    expect(resolveStyle(hostsByTestID(tree, "time-grid-day-column")[0]!.props.style)).toMatchObject({
      borderLeftColor: tokens.hairlineGhost,
    });
  });

  it("renders hour marks through both 24-hour and 12-hour formatters", () => {
    const col = column("2025-06-16");
    const view24 = renderGrid([col], new Map(), vi.fn(), false, (time) => time);
    expect(textValuesWithin(view24, "time-grid-hour-label")).toContain("20:00");

    const view12 = renderGrid([col], new Map(), vi.fn(), false, (time) => {
      const hour = Number(time.slice(0, 2));
      return `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
    });
    expect(textValuesWithin(view12, "time-grid-hour-label")).toContain("8:00 PM");
  });

  it("positions the now line by the account timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T10:30:00.000Z"));
    const today = { ...column("2026-09-12"), isToday: true };
    try {
      const tree = renderGrid(
        [today],
        new Map(),
        vi.fn(),
        false,
        displayTime,
        "Pacific/Kiritimati",
      );
      const nowLine = tree.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.accessibilityLabel === "Now",
      )[0];

      expect(resolveStyle(nowLine!.props.style)).toMatchObject({ top: 24 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders one column header per day in the range", () => {
    const columns = ["2025-06-16", "2025-06-17", "2025-06-18", "2025-06-19"].map(
      (dateStr) => column(dateStr),
    );
    const tree = renderGrid(columns, new Map());

    expect(hostsByTestID(tree, "time-grid-col-header")).toHaveLength(4);
  });

  it("shows one named chip and opens the day for two remaining habits", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const entries = Array.from({ length: 3 }, (_, index) => makeEntry({ habitId: String(index), title: `All ${index}` }));
    const tree = renderGrid([col], new Map([[col.dateStr, entries]]), onSelectDay);
    expect(textValuesWithin(tree, "time-grid-all-day-event")).toContain("All 0");
    const more = hostsByTestID(tree, "time-grid-all-day-more")[0]!;
    expect(more.props.accessibilityLabel).toBe('calendar.timeGrid.moreCountLabel:{"count":2}');
    expect(resolveStyle(more.props.style)).toMatchObject({ minHeight: 48, minWidth: 48 });
    TestRenderer.act(() => more.props.onPress());
    expect(onSelectDay).toHaveBeenCalledWith(col.dateStr);
    TestRenderer.act(() => hostsByTestID(tree, "time-grid-all-day-event")[0]!.props.onPress());
    expect(tree.root.findAll((node) => node.type === CalendarEntryDetails)[0]!.props.entries[0].title).toBe("All 0");
  });

  it.each([320, 412, 600].flatMap((width) => [0, 3, 6].map((todayIndex) => ({ width, todayIndex }))))('opens on the nearest column boundary at the gutter with today fully visible ($width, today=$todayIndex)', ({ width, todayIndex }) => {
    let horizontalOffset = 0;
    __setScrollToImpl((position) => { if (position.x !== undefined) horizontalOffset = position.x; });
    try {
      const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(`2026-10-${String(5 + index).padStart(2, '0')}`), isToday: index === todayIndex }));
      const tree = renderGrid(columns, new Map());
      const horizontal = () => tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      const gutter = 96;
      const viewportWidth = width - gutter;
      const columnWidth = Number(resolveStyle(hostsByTestID(tree, 'time-grid-col-header')[0]!.props.style).width);
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: viewportWidth, height: 400 } } });
        horizontal().props.onContentSizeChange(columns.length * columnWidth, 400);
      });
      const leftmostIndex = Math.floor(horizontalOffset / columnWidth);
      expect(gutter + leftmostIndex * columnWidth - horizontalOffset).toBe(gutter);
      const content = hostParent(hostsByTestID(tree, 'time-grid-hour-scroller')[0]!);
      const trailingSpace = Number(resolveStyle(content.props.style).paddingRight ?? 0);
      expect(horizontalOffset + viewportWidth).toBeLessThanOrEqual(columns.length * columnWidth + trailingSpace);
      const todayLeft = gutter + todayIndex * columnWidth - horizontalOffset;
      expect(todayLeft).toBeGreaterThanOrEqual(gutter);
      expect(todayLeft + columnWidth).toBeLessThanOrEqual(width);
      const centered = Math.max(0, todayIndex * columnWidth - (viewportWidth - columnWidth) / 2);
      expect(Math.abs(horizontalOffset - centered)).toBeLessThanOrEqual(columnWidth / 2);
      if (todayIndex > 0) expect(horizontalOffset).toBeGreaterThan(0);
      TestRenderer.act(() => horizontal().props.onScrollBeginDrag());
      horizontalOffset = 88;
      TestRenderer.act(() => horizontal().props.onLayout({ nativeEvent: { layout: { width: viewportWidth + 16, height: 400 } } }));
      expect(horizontalOffset).toBe(88);
    } finally { __setScrollToImpl(() => {}); }
  });

  it.each([600, 1080])("keeps the settled scroll extent at %s reachable when the pane shrinks", (offset) => {
    const tree = renderGrid([column('2026-10-08')], new Map());
    const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
    const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
    TestRenderer.act(() => {
      body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 464 } } });
      pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 178 } } });
      body().props.onScrollBeginDrag();
      body().props.onScroll({ nativeEvent: {
        contentOffset: { x: 0, y: offset }, contentSize: { width: 800, height: 1678 },
        layoutMeasurement: { width: 800, height: 464 },
      } });
    });
    TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } }));
    for (const height of [464, 384, 544]) {
      TestRenderer.act(() => body().props.onLayout({ nativeEvent: { layout: { width: 800, height } } }));
      const scrollers = tree.root.findAll((node) => node.type === 'ScrollView' && !node.props.horizontal);
      expect(scrollers).toHaveLength(2);
      for (const scroller of scrollers) expect(resolveStyle(scroller.props.contentContainerStyle).minHeight).toBeGreaterThanOrEqual(offset + height);
    }
    TestRenderer.act(() => body().props.onScroll({ nativeEvent: {
      contentOffset: { x: 0, y: 120 }, contentSize: { width: 800, height: 1678 },
      layoutMeasurement: { width: 800, height: 544 },
    } }));
    expect(resolveStyle(body().props.contentContainerStyle).minHeight).toBe(120 + 544);
  });

  it.each([false, true])("opens loaded concurrent lanes once and respects prior dragging (dragged=%s)", (dragged) => {
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(`2026-10-${String(5 + index).padStart(2, '0')}`), isToday: index === 3 }));
      const tree = renderGrid(columns, new Map(), vi.fn(), true);
      const horizontal = () => tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 284, height: 400 } } });
        horizontal().props.onContentSizeChange(1344, 400);
      });
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toHaveLength(0);
      const crowded = new Map([[columns[3]!.dateStr, [makeEntry({ habitId: 'first', dueTime: '08:00' }), makeEntry({ habitId: 'second', dueTime: '08:00' }), makeEntry({ habitId: 'third', dueTime: '08:00' })]]]);
      const update = (dayMap: Map<string, CalendarDayEntry[]>) => TestRenderer.act(() => tree.update(
        <CalendarTimeGrid columns={columns} dayMap={dayMap} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={false} t={translate} tokens={tokens} timeZone="UTC" />,
      ));
      if (dragged) TestRenderer.act(() => horizontal().props.onScrollBeginDrag());
      update(crowded);
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toHaveLength(0);
      TestRenderer.act(() => horizontal().props.onContentSizeChange(2016, 400));
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toEqual(dragged ? [] : [[{ x: 864, animated: false }]]);
      TestRenderer.act(() => horizontal().props.onScrollBeginDrag());
      update(new Map([[columns[3]!.dateStr, [...crowded.get(columns[3]!.dateStr)!, makeEntry({ habitId: 'fourth', dueTime: '08:00' })]]]));
      TestRenderer.act(() => horizontal().props.onLayout({ nativeEvent: { layout: { width: 300, height: 400 } } }));
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toHaveLength(dragged ? 0 : 1);
    } finally { __setScrollToImpl(() => {}); }
  });

  it.each(['none', 'scroll', 'scroll-start', 'drag', 'touch'])("holds the opening position through pane pinning until input=%s", (input) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    let scrollOffset = 0;
    const scrollTo = vi.fn((offset: { y?: number }) => { if (offset.y !== undefined) scrollOffset = offset.y; });
    __setScrollToImpl(scrollTo);
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
      });
      expect(body().props.stickyHeaderIndices).toEqual([]);
      const nowLine = tree.root.findAll((node) => node.type === 'View' && node.props.accessibilityLabel === 'Now')[0]!;
      const nowTop = Number(resolveStyle(nowLine.props.style).top);
      expect(300 + nowTop - scrollOffset).toBe(100);
      TestRenderer.act(() => body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: scrollOffset }, contentSize: { width: 800, height: 1752 }, layoutMeasurement: { width: 800, height: 400 } } }));
      if (input !== 'none') TestRenderer.act(() => {
        if (input === 'drag') body().props.onScrollBeginDrag();
        if (input === 'touch') body().props.onTouchMove?.();
        scrollOffset = input === 'scroll-start' ? 0 : 600;
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: scrollOffset }, contentSize: { width: 800, height: 1752 }, layoutMeasurement: { width: 800, height: 400 } } });
      });
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } }));
      expect(body().props.stickyHeaderIndices).toEqual([0]);
      if (input === 'none') {
        const belowPane = nowTop - scrollOffset;
        expect(belowPane).toBeGreaterThanOrEqual(0);
        expect(belowPane).toBeLessThanOrEqual(300 / 3);
      } else expect(scrollOffset).toBe(input === 'scroll-start' ? 0 : 600);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([
    { movement: 'native clamp', offset: 1152, contentHeight: 1552, expected: 957 },
    { movement: 'native clamp within one DIP', offset: 1151.5, contentHeight: 1552, expected: 957 },
    { movement: 'upward input below the maximum', offset: 1100, contentHeight: 1552, expected: 1100 },
    { movement: 'upward input outside clamp tolerance', offset: 1150, contentHeight: 1552, expected: 1150 },
    { movement: 'input to the end', offset: 1352, contentHeight: 1752, expected: 1352 },
  ])("corrects the opening after $movement arrives before the shorter pane layout", ({ offset, contentHeight, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    let scrollOffset = 0;
    __setScrollToImpl((position) => { if (position.y !== undefined) scrollOffset = position.y; });
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
      });
      expect(scrollOffset).toBe(1232);
      TestRenderer.act(() => body().props.onScroll({ nativeEvent: {
        contentOffset: { x: 0, y: scrollOffset },
        contentSize: { width: 800, height: 1752 },
        layoutMeasurement: { width: 800, height: 400 },
      } }));
      TestRenderer.act(() => {
        scrollOffset = offset;
        body().props.onScroll({ nativeEvent: {
          contentOffset: { x: 0, y: offset },
          contentSize: { width: 800, height: contentHeight },
          layoutMeasurement: { width: 800, height: 400 },
        } });
      });
      expect(scrollOffset).toBe(offset);
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } }));
      expect(body().props.stickyHeaderIndices).toEqual([0]);
      expect(scrollOffset).toBe(expected);
      if (expected === 957) expect(1032 - scrollOffset).toBe(75);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([
    { movement: 'native clamp', offset: 1060, contentWidth: 1344, expected: 1152 },
    { movement: 'upward input below the maximum', offset: 1000, contentWidth: 1344, expected: 1000 },
    { movement: 'input to the end', offset: 1788, contentWidth: 2072, expected: 1788 },
  ])("keeps horizontal opening ownership after $movement", ({ offset, contentWidth, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    let horizontalOffset = 0;
    let verticalOffset = 0;
    __setScrollToImpl((position) => {
      if (position.x !== undefined) horizontalOffset = position.x;
      if (position.y !== undefined) verticalOffset = position.y;
    });
    try {
      const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(`2026-10-${String(5 + index).padStart(2, '0')}`), isToday: index === 6 }));
      const crowded = new Map([[columns[6]!.dateStr, [makeEntry({ habitId: 'first', dueTime: '08:00' }), makeEntry({ habitId: 'second', dueTime: '08:00' }), makeEntry({ habitId: 'third', dueTime: '08:00' })]]]);
      const tree = renderGrid(columns, crowded);
      const horizontal = () => tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 284, height: 400 } } });
        horizontal().props.onContentSizeChange(2016, 400);
        body().props.onLayout({ nativeEvent: { layout: { width: 2016, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 2016, height: 300 } } });
      });
      expect(horizontalOffset).toBe(1728);
      expect(verticalOffset).toBe(1232);
      TestRenderer.act(() => horizontal().props.onScroll({ nativeEvent: {
        contentOffset: { x: 1728, y: 0 },
        contentSize: { width: 2016, height: 400 },
        layoutMeasurement: { width: 284, height: 400 },
      } }));
      TestRenderer.act(() => {
        horizontalOffset = offset;
        horizontal().props.onScroll({ nativeEvent: {
          contentOffset: { x: offset, y: 0 },
          contentSize: { width: contentWidth, height: 400 },
          layoutMeasurement: { width: 284, height: 400 },
        } });
      });
      TestRenderer.act(() => tree.update(
        <CalendarTimeGrid columns={columns} dayMap={new Map()} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={false} t={translate} tokens={tokens} timeZone="UTC" />,
      ));
      TestRenderer.act(() => {
        horizontal().props.onContentSizeChange(1344, 400);
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 300, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 1344, height: 100 } } });
      });
      expect(horizontalOffset).toBe(expected);
      expect(verticalOffset).toBe(expected === 1152 ? 957 : 1232);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it("holds now in the upper third through viewport and hour scale changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 800, height: 915, scale: 1, fontScale: 1 });
    let scrollOffset = 0;
    __setScrollToImpl((offset) => { if (offset.y !== undefined) scrollOffset = offset.y; });
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } });
      });
      const firstOffset = scrollOffset;
      expect(1032 - scrollOffset).toBe(75);
      TestRenderer.act(() => body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } }));
      expect(1032 - scrollOffset).toBe(50);
      TestRenderer.act(() => {
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: firstOffset }, contentSize: { width: 800, height: 1477 }, layoutMeasurement: { width: 800, height: 300 } } });
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: scrollOffset }, contentSize: { width: 800, height: 1477 }, layoutMeasurement: { width: 800, height: 300 } } });
      });
      dimensions.mockReturnValue({ width: 800, height: 915, scale: 1, fontScale: 2 });
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 120 } } }));
      expect(2064 - scrollOffset).toBe(45);
      TestRenderer.act(() => {
        body().props.onScrollBeginDrag();
        scrollOffset = 0;
        body().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, contentSize: { width: 800, height: 2680 }, layoutMeasurement: { width: 800, height: 300 } } });
      });
      dimensions.mockReturnValue({ width: 800, height: 915, scale: 1, fontScale: 1 });
      TestRenderer.act(() => body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } }));
      expect(scrollOffset).toBe(0);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([0, 6])("keeps edge-day horizontal opening scrolls under grid ownership (today=%s)", (todayIndex) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const columns = Array.from({ length: 7 }, (_, index) => ({ ...column(`2026-10-${String(5 + index).padStart(2, '0')}`), isToday: index === todayIndex }));
      const tree = renderGrid(columns, new Map());
      const horizontal = () => tree.root.findAll((node) => node.type === 'ScrollView' && node.props.horizontal)[0]!;
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 284, height: 400 } } });
        horizontal().props.onContentSizeChange(1344, 400);
        body().props.onLayout({ nativeEvent: { layout: { width: 1344, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 1344, height: 300 } } });
      });
      const horizontalOffset = todayIndex === 0 ? 0 : 1152;
      expect(scrollTo.mock.calls.filter(([offset]) => 'x' in offset)).toEqual([[{ x: horizontalOffset, animated: false }]]);
      TestRenderer.act(() => horizontal().props.onScroll({ nativeEvent: { contentOffset: { x: horizontalOffset, y: 0 }, contentSize: { width: 1344, height: 400 }, layoutMeasurement: { width: 284, height: 400 } } }));
      scrollTo.mockClear();
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 1344, height: 100 } } }));
      expect(scrollTo.mock.calls.filter(([offset]) => 'y' in offset)).toEqual([[{ y: 957, animated: false }], [{ y: 957, animated: false }]]);
      TestRenderer.act(() => horizontal().props.onScroll({ nativeEvent: { contentOffset: { x: 100, y: 0 }, contentSize: { width: 1344, height: 400 }, layoutMeasurement: { width: 284, height: 400 } } }));
      scrollTo.mockClear();
      TestRenderer.act(() => {
        horizontal().props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } });
        body().props.onLayout({ nativeEvent: { layout: { width: 1344, height: 300 } } });
      });
      expect(scrollTo).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it("unpins oversized day lanes and repins at half the viewport after a layout", () => {
    const tree = renderGrid([column('2025-06-16')], new Map());
    const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
    const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
    TestRenderer.act(() => {
      body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
      pane().props.onLayout?.({ nativeEvent: { layout: { width: 800, height: 200 } } });
    });
    expect(body().props.stickyHeaderIndices).toEqual([0]);
    TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 201 } } }));
    expect(body().props.stickyHeaderIndices).toEqual([]);
    let parent = hostsByTestID(tree, 'time-grid-col-header')[0]!.parent;
    while (parent && parent !== body()) parent = parent.parent;
    expect(parent).toBe(body());
    TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 100 } } }));
    expect(body().props.stickyHeaderIndices).toEqual([0]);
  });

  it("opens the hour body with now in its upper third", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const tree = renderGrid([{ ...column('2026-10-08'), isToday: true }], new Map());
      const body = hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      TestRenderer.act(() => {
        body.props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
        hostsByTestID(tree, 'time-grid-day-pane')[0]!.props.onLayout({ nativeEvent: { layout: { width: 800, height: 120 } } });
      });
      const y = scrollTo.mock.calls[0]![0].y;
      expect(120 + 1032 - y).toBeGreaterThanOrEqual(120);
      expect(120 + 1032 - y).toBeLessThanOrEqual(180);
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it.each([178, 126])("opens against the loaded pane layout even when its height stays the same (height=%s)", (loadedHeight) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z'));
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const today = { ...column('2026-10-08'), isToday: true };
      const columns = [today];
      const grid = (dayMap: Map<string, CalendarDayEntry[]>, isLoading: boolean) => <CalendarTimeGrid columns={columns} dayMap={dayMap} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={isLoading} t={translate} tokens={tokens} timeZone="UTC" />;
      const tree = renderGrid(columns, new Map(), vi.fn(), true);
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      const pane = () => hostsByTestID(tree, 'time-grid-day-pane')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } });
      });
      expect(scrollTo).not.toHaveBeenCalled();
      const loadingPane = pane();
      const entries = Array.from({ length: 3 }, (_, index) => makeEntry({ habitId: String(index) }));
      const loaded = new Map([[today.dateStr, entries]]);
      TestRenderer.act(() => tree.update(grid(loaded, false)));
      expect(scrollTo).not.toHaveBeenCalled();
      expect(pane()).not.toBe(loadingPane);
      TestRenderer.act(() => pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: loadedHeight } } }));
      const pinned = loadedHeight <= 150;
      const firstOffset = scrollTo.mock.calls[0]![0].y;
      const visibleHourHeight = 300 - (pinned ? loadedHeight : 0);
      const visibleNow = 1032 + (pinned ? 0 : loadedHeight) - firstOffset;
      expect(visibleNow).toBeGreaterThanOrEqual(0);
      expect(visibleNow).toBeLessThanOrEqual(visibleHourHeight / 3);
      expect(body().props.stickyHeaderIndices).toEqual(pinned ? [0] : []);
      expect(scrollTo.mock.calls).toEqual([[{ y: firstOffset, animated: false }], [{ y: firstOffset, animated: false }]]);
      scrollTo.mockClear();
      TestRenderer.act(() => body().props.onScrollBeginDrag());
      TestRenderer.act(() => tree.update(grid(new Map([[today.dateStr, entries.slice(0, 1)]]), false)));
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
        pane().props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } });
      });
      expect(scrollTo).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); __setScrollToImpl(() => {}); }
  });

  it("preserves a vertical drag before the loaded pane layout arrives", () => {
    const scrollTo = vi.fn();
    __setScrollToImpl(scrollTo);
    try {
      const columns = [{ ...column('2026-10-08'), isToday: true }];
      const tree = renderGrid(columns, new Map(), vi.fn(), true);
      const body = () => hostsByTestID(tree, 'time-grid-hour-scroller')[0]!;
      TestRenderer.act(() => {
        body().props.onLayout({ nativeEvent: { layout: { width: 800, height: 300 } } });
        hostsByTestID(tree, 'time-grid-day-pane')[0]!.props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } });
        body().props.onScrollBeginDrag?.();
      });
      TestRenderer.act(() => tree.update(<CalendarTimeGrid columns={columns} dayMap={new Map()} onSelectDay={vi.fn()} displayTime={displayTime} language="en" allDayLabel="No set time" nowLabel="Now" isLoading={false} t={translate} tokens={tokens} timeZone="UTC" />));
      TestRenderer.act(() => hostsByTestID(tree, 'time-grid-day-pane')[0]!.props.onLayout({ nativeEvent: { layout: { width: 800, height: 126 } } }));
      expect(scrollTo).not.toHaveBeenCalled();
    } finally { __setScrollToImpl(() => {}); }
  });

  it("uses natural short weekdays and only the date accent", () => {
    const tree = renderGrid([{ ...column("2025-06-16"), isToday: true }], new Map());
    const weekday = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'Mon')[0]!;
    expect(weekday).toBeDefined();
    expect(resolveStyle(weekday.props.style)).not.toHaveProperty('textTransform');
    expect(resolveStyle(weekday.props.style)).not.toHaveProperty('letterSpacing');
    expect(resolveStyle(weekday.props.style).color).toBe(tokens.fg2);
    const accents = tree.root.findAll((node) => typeof node.type === 'string' && resolveStyle(node.props.style).backgroundColor === tokens.primary);
    expect(accents).toHaveLength(3);
  });

  it("reserves enough band height for a 48px summary and its padding", () => {
    const col = column("2025-06-16");
    const tree = renderGrid([col], new Map([[col.dateStr, [makeEntry({ dueTime: null })]]]));
    expect(renderedAncestorHeight(hostsByTestID(tree, "time-grid-all-day")[0]!)).toBeGreaterThanOrEqual(64);
  });

  it("opens the tapped day from a column header", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const tree = renderGrid([col], new Map(), onSelectDay);

    const headers = hostsByTestID(tree, "time-grid-col-header");
    TestRenderer.act(() => {
      headers[0]!.props.onPress();
    });
    expect(onSelectDay).toHaveBeenCalledWith("2025-06-16");
  });

  it("discloses the timed name without selecting another day", () => {
    const onSelectDay = vi.fn();
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "a", title: "Standup", dueTime: "08:00" })]],
    ]);
    const tree = renderGrid([col], dayMap, onSelectDay);

    const blocks = hostsByTestID(tree, "time-grid-event");
    expect(blocks).toHaveLength(1);
    TestRenderer.act(() => {
      blocks[0]!.props.onPress();
    });
    expect(onSelectDay).not.toHaveBeenCalled();
    const details = tree.root.findAll((node) => node.type === CalendarEntryDetails)[0]!;
    expect(details.props.entries[0].title).toBe("Standup");
    sheetTestControls.defer(true);
    TestRenderer.act(() => tree.root.findAll((node) => node.type === "Pressable" && node.props.accessibilityLabel === "attempt-dismiss")[0]!.props.onPress());
    expect(tree.root.findAll((node) => node.type === CalendarEntryDetails)).toHaveLength(1);
    TestRenderer.act(() => sheetTestControls.completeDismissal());
    expect(tree.root.findAll((node) => node.type === CalendarEntryDetails)).toHaveLength(0);
    expect(hostsByTestID(tree, "time-grid-event")).toHaveLength(1);
  });

  it.each(['dark', 'light'] as const)("labels and fills the untimed summary in %s", (mode) => {
    const col = column("2025-06-16");
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ habitId: `ad-${i}`, title: `All ${i}`, dueTime: null }),
    );
    const gridTokens = createTokensV2('purple', mode);
    const tree = renderGrid([col], new Map([[col.dateStr, entries]]), vi.fn(), false, displayTime, 'UTC', gridTokens);

    const more = hostsByTestID(tree, "time-grid-all-day-more");
    expect(more[0]!.props.accessibilityLabel).toBe(
      'calendar.timeGrid.moreCountLabel:{"count":7}',
    );
    expect(resolveStyle(more[0]!.props.style)).toMatchObject({ minHeight: 48, minWidth: 48, borderRadius: 8 });
    expect(StyleSheet.flatten(more[0]!.props.style({ pressed: true }))).toMatchObject({
      backgroundColor: gridTokens.bgHover,
      borderRadius: 8,
    });
  });

  it("shows the empty message when no visible day has entries", () => {
    const tree = renderGrid([column("2025-06-16")], new Map());

    expect(hostsByTestID(tree, "time-grid-empty")).toHaveLength(1);
    expect(textValuesWithin(tree, "time-grid-empty")).toContain(
      "calendar.timeGrid.empty",
    );
  });

  it("hides the empty message while the range is loading", () => {
    const tree = renderGrid([column("2025-06-16")], new Map(), vi.fn(), true);

    expect(hostsByTestID(tree, "time-grid-empty")).toHaveLength(0);
  });

  it("hides the empty message when any visible day has an entry", () => {
    const col = column("2025-06-16");
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [col.dateStr, [makeEntry({ habitId: "a", dueTime: "08:00" })]],
    ]);
    const tree = renderGrid([col], dayMap);

    expect(hostsByTestID(tree, "time-grid-empty")).toHaveLength(0);
  });
});

function headerInteractions(mode: 'dark' | 'light', language: 'en' | 'pt-BR') {
  setRuntimeTheme({ themeMode: mode });
  const palette = createTokensV2('purple', mode);
  const columns = [{ ...column('2026-10-05'), isToday: true }, column('2026-10-06', true)];
  const onSelectDay = vi.fn();
  const words = language === 'pt-BR' ? ptBR : en;
  const tree = renderGrid(columns, new Map(), onSelectDay, false, displayTime, 'UTC', palette, language, words.calendar.timeGrid.noSetTime);
  const headers = () => hostsByTestID(tree, 'time-grid-col-header');
  const header = () => headers()[0]!;
  const hover = attachedHeaderHover(header());
  const otherHover = attachedHeaderHover(headers()[1]!);
  expect(otherHover).not.toBe(hover);
  const style = (pressed = false) => resolveStyle(header().props.style({ pressed }));
  const fill = (index = 0) => hostsByTestID(tree, 'time-grid-col-header-fill').find((candidate) => {
    for (let parent = candidate.parent; parent; parent = parent.parent) if (parent === headers()[index]) return true;
    return false;
  })!;
  const paint = (index = 0) => resolveStyle(fill(index).props.style).backgroundColor ?? 'transparent';
  for (let index = 0; index < headers().length; index++) {
    const target = resolveStyle(headers()[index]!.props.style);
    expect(target.backgroundColor ?? 'transparent').toBe('transparent');
    expect(resolveStyle(headers()[index]!.props.style({ pressed: true })).backgroundColor ?? 'transparent').toBe('transparent');
    expect(fill(index)).toBeDefined();
    expect(resolveStyle(fill(index).props.style)).toMatchObject({
      position: 'absolute', top: INTERACTION_FILL_CLEARANCE, right: INTERACTION_FILL_CLEARANCE,
      bottom: INTERACTION_FILL_CLEARANCE, left: INTERACTION_FILL_CLEARANCE, borderRadius: radius.sm,
    });
    expect(fill(index).props.pointerEvents).toBe('none');
    expect(target.borderRadius).toBe(radius.sm);
  }
  const run = (event: 'hoverBegin' | 'hoverFinalize' | 'onPressIn' | 'onPressOut') => {
    expect(attachedHeaderHover(header())).toBe(hover);
    if (event === 'hoverBegin') deliverHover(hover, State.BEGAN, State.UNDETERMINED);
    else if (event === 'hoverFinalize') deliverHover(hover, State.END, State.BEGAN);
    else TestRenderer.act(() => { header().props[event]?.(); });
  };
  const focus = (index: number) => {
    __setTouchMode(false);
    TestRenderer.act(() => { __focusHost(headers()[index]!.props.__nativeTag); });
  };
  const outlines = () => tree.root.findAll((node) => {
    if (node.type !== 'View' || resolveStyle(node.props.style).outlineWidth !== 2) return false;
    for (let parent = node.parent; parent; parent = parent.parent) if (parent === header()) return true;
    return false;
  });
  return { tree, columns, onSelectDay, palette, headers, header, hover, otherHover, style, paint, run, focus, outlines };
}

function headerGeometry(style: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(style).filter(([key]) => key !== 'backgroundColor' && key !== 'transform'));
}

describe.each(['dark', 'light'] as const)('Calendar column-header interactions in %s', (mode) => {
  it.each(['en', 'pt-BR'] as const)('paints hover alone independently without changing geometry or focus in %s', (language) => {
    const view = headerInteractions(mode, language);
    const initialGeometry = headerGeometry(view.style());
    const initialFocus = __getFocusedNativeTag();
    expect(view.paint()).toBe('transparent');
    for (let cycle = 0; cycle < 3; cycle++) {
      view.run('hoverBegin');
      view.run('hoverBegin');
      expect(view.paint()).toBe(view.palette.bgHover);
      expect(view.style().transform).toBeUndefined();
      expect(view.outlines()).toHaveLength(0);
      expect(__getFocusedNativeTag()).toBe(initialFocus);
      expect(headerGeometry(view.style())).toEqual(initialGeometry);
      expect(view.paint(1)).toBe('transparent');
      view.run('hoverFinalize');
      view.run('hoverFinalize');
      expect(view.paint()).toBe('transparent');
    }
    expect(view.onSelectDay).not.toHaveBeenCalled();
  });

  it.each(['en', 'pt-BR'] as const)('retains hover after press-out and held press after hover-out in %s', (language) => {
    const view = headerInteractions(mode, language);
    view.run('hoverBegin');
    view.run('onPressIn');
    expect(view.paint()).toBe(view.palette.bgHover);
    expect(view.style(true).transform).toEqual([{ scale: 0.96 }]);
    view.run('onPressOut');
    expect(view.paint()).toBe(view.palette.bgHover);
    expect(view.style().transform).toBeUndefined();
    view.run('onPressIn');
    view.run('hoverFinalize');
    expect(view.paint()).toBe(view.palette.bgHover);
    view.run('onPressOut');
    expect(view.paint()).toBe('transparent');
    expect(view.onSelectDay).not.toHaveBeenCalled();
  });

  it.each(['en', 'pt-BR'] as const)('retains focus paint and one inset outline through hover and cancelled press in %s', (language) => {
    const view = headerInteractions(mode, language);
    const initialGeometry = headerGeometry(view.style());
    view.focus(0);
    expect(view.paint()).toBe(view.palette.bgHover);
    view.run('hoverBegin');
    view.run('hoverFinalize');
    view.run('onPressIn');
    view.run('onPressOut');
    expect(view.paint()).toBe(view.palette.bgHover);
    expect(view.style().transform).toBeUndefined();
    expect(view.outlines()).toHaveLength(1);
    expect(resolveStyle(view.outlines()[0]!.props.style).outlineOffset).toBe(-INTERACTION_FILL_CLEARANCE - 2);
    expect(headerGeometry(view.style())).toEqual(initialGeometry);
    view.focus(1);
    expect(view.paint()).toBe('transparent');
    expect(view.outlines()).toHaveLength(0);
    expect(view.onSelectDay).not.toHaveBeenCalled();
  });

  it.each(['en', 'pt-BR'] as const)('clears only focus on blur while hover or held press remains in %s', (language) => {
    const view = headerInteractions(mode, language);
    view.focus(0);
    view.run('hoverBegin');
    view.focus(1);
    expect(view.paint()).toBe(view.palette.bgHover);
    expect(view.outlines()).toHaveLength(0);
    view.run('hoverFinalize');
    expect(view.paint()).toBe('transparent');
    view.focus(0);
    view.run('onPressIn');
    view.focus(1);
    expect(view.paint()).toBe(view.palette.bgHover);
    view.run('onPressOut');
    expect(view.paint()).toBe('transparent');
    expect(view.onSelectDay).not.toHaveBeenCalled();
  });

  it.each(['en', 'pt-BR'] as const)('keeps touch activation exact and cancellation inert with the full-column target in %s', (language) => {
    const view = headerInteractions(mode, language);
    const initial = view.style();
    expect(initial).toMatchObject({ width: 192, paddingVertical: 8, borderRadius: radius.sm });
    let frame = view.header().parent;
    while (frame && frame.type !== 'View') frame = frame.parent;
    expect(resolveStyle(frame!.props.style).width).toBe(initial.width);
    const gridLines = view.tree.root.findAll((node) => {
      if (node.type !== 'View' || node.props.pointerEvents !== 'none') return false;
      let owner = node.parent;
      while (owner && typeof owner.type !== 'string') owner = owner.parent;
      return owner === frame;
    });
    expect(gridLines).toHaveLength(1);
    expect(resolveStyle(gridLines[0]!.props.style)).toMatchObject({
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
      borderLeftWidth: 1, borderBottomWidth: 1,
      borderLeftColor: view.palette.hairline, borderBottomColor: view.palette.hairline,
    });
    expect(renderedAncestorHeight(view.header())).toBeGreaterThanOrEqual(48);
    view.run('onPressIn');
    expect(view.paint()).toBe(view.palette.bgHover);
    view.run('onPressOut');
    expect(view.paint()).toBe('transparent');
    expect(view.onSelectDay).not.toHaveBeenCalled();
    TestRenderer.act(() => { view.header().props.onPress(); });
    expect(view.onSelectDay).toHaveBeenCalledExactlyOnceWith(view.columns[0]!.dateStr);
    view.onSelectDay.mockClear();
    TestRenderer.act(() => { view.headers()[1]!.props.onPress(); });
    expect(view.onSelectDay).toHaveBeenCalledExactlyOnceWith(view.columns[1]!.dateStr);
    expect(headerGeometry(view.style())).toEqual(headerGeometry(initial));
  });

  it.each(['en', 'pt-BR'] as const)('resets local feedback on remount in narrow and wide windows in %s', (language) => {
    for (const width of [320, 1352]) {
      vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 640, scale: 1, fontScale: 1 });
      const view = headerInteractions(mode, language);
      view.run('hoverBegin');
      view.focus(0);
      view.run('onPressIn');
      TestRenderer.act(() => { view.tree.update(<></>); });
      expect(findHandler(view.hover.handlerTag)).toBeUndefined();
      expect(findHandler(view.otherHover.handlerTag)).toBeUndefined();
      const remounted = headerInteractions(mode, language);
      expect(remounted.hover.handlerTag).not.toBe(view.hover.handlerTag);
      deliverHover(view.hover, State.BEGAN, State.UNDETERMINED);
      expect(remounted.paint()).toBe('transparent');
      expect(remounted.outlines()).toHaveLength(0);
      remounted.run('hoverBegin');
      expect(remounted.paint()).toBe(remounted.palette.bgHover);
      expect(view.onSelectDay).not.toHaveBeenCalled();
      expect(remounted.onSelectDay).not.toHaveBeenCalled();
    }
  });

  it.each(['en', 'pt-BR'] as const)('finalizes cancelled and failed hover without selecting or leaking into another column in %s', (language) => {
    for (const terminal of [State.END, State.CANCELLED, State.FAILED]) {
      const view = headerInteractions(mode, language);
      view.run('hoverBegin');
      expect(view.paint()).toBe(view.palette.bgHover);
      deliverHover(view.otherHover, State.BEGAN, State.UNDETERMINED);
      deliverHover(view.hover, terminal, State.BEGAN);
      expect(view.paint()).toBe('transparent');
      expect(view.paint(1)).toBe(view.palette.bgHover);
      deliverHover(view.otherHover, terminal, State.BEGAN);
      expect(view.paint(1)).toBe('transparent');
      view.focus(0);
      view.run('onPressIn');
      view.run('hoverBegin');
      deliverHover(view.hover, terminal, State.BEGAN);
      expect(view.paint()).toBe(view.palette.bgHover);
      view.run('onPressOut');
      expect(view.paint()).toBe(view.palette.bgHover);
      expect(view.outlines()).toHaveLength(1);
      view.focus(1);
      expect(view.paint()).toBe('transparent');
      expect(view.onSelectDay).not.toHaveBeenCalled();
    }
  });

  it.each(['en', 'pt-BR'] as const)('keeps static feedback while reduced motion suppresses press scale in %s', (language) => {
    vi.mocked(usePrefersReducedMotion).mockReturnValue(true);
    const view = headerInteractions(mode, language);
    view.run('onPressIn');
    expect(view.paint()).toBe(view.palette.bgHover);
    expect(view.style(true).transform).toBeUndefined();
    view.run('onPressOut');
    view.run('hoverBegin');
    expect(view.paint()).toBe(view.palette.bgHover);
    view.run('onPressIn');
    expect(view.paint()).toBe(view.palette.bgHover);
    expect(view.style(true).transform).toBeUndefined();
    view.run('hoverFinalize');
    expect(view.paint()).toBe(view.palette.bgHover);
    view.run('onPressOut');
    expect(view.paint()).toBe('transparent');
    view.focus(0);
    expect(view.paint()).toBe(view.palette.bgHover);
    expect(view.style().transform).toBeUndefined();
    expect(view.onSelectDay).not.toHaveBeenCalled();
  });
});

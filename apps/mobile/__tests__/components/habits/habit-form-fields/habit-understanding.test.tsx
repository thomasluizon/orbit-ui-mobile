import React from "react";
import { describe, expect, it, vi } from "vitest";
import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import { HabitUnderstanding } from "@/components/habits/habit-form-fields/habit-understanding";
import { createTokensV2 } from "@/lib/theme";

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({ currentScheme: "orange", currentTheme: "light" }),
}));

vi.mock("@/components/ui/proposed", () => ({
  Proposed: (props: Record<string, unknown>) =>
    React.createElement("Proposed", props, props.children as React.ReactNode),
}));

vi.mock("@/components/habits/habit-form-fields/habit-emoji-selector", () => ({
  HabitEmojiSelector: (props: Record<string, unknown>) =>
    React.createElement("HabitEmojiSelector", props),
}));

interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  parent: TestNode | null;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}

interface TestTree {
  root: TestNode;
  update(element: React.ReactNode): void;
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree;
  act(callback: () => void): void;
}

const TestRenderer: TestRendererApi = require("react-test-renderer");
const tokens = createTokensV2("orange", "light");

const labels = {
  field: "Describe the habit",
  placeholder: "Run every weekday",
  understood: "Orbit understood",
  understoodAstra: "Astra proposed",
  unresolved: "Choose a schedule",
  days: "Active days",
  less: "Less often",
  more: "More often",
  count: (count: number) => `${count === 1 ? "time" : "times"} a week`,
  scheduleMode: "Schedule",
  setDays: "Set days",
  timesAWeek: "Times a week",
  repeat: (count: number) => count === 1 ? "Every week" : `Every ${count} weeks`,
  repeatLess: "Repeat less often",
  repeatMore: "Repeat more often",
  proposed: "Proposed by Astra",
};

function renderUnderstanding(
  overrides: Partial<React.ComponentProps<typeof HabitUnderstanding>> = {},
) {
  const props: React.ComponentProps<typeof HabitUnderstanding> = {
    value: "",
    emoji: "",
    days: [],
    dayOptions: [
      { value: "Monday", label: "S", accessibleLabel: "Segunda-feira" },
      { value: "Tuesday", label: "T", accessibleLabel: "Terça-feira" },
    ],
    quantity: 1,
    mode: "fixed",
    intervalWeeks: 1,
    sentence: null,
    consumed: [],
    onValueChange: vi.fn(),
    onEmojiSelect: vi.fn(),
    onToggleDay: vi.fn(),
    onQuantityChange: vi.fn(),
    onModeChange: vi.fn(),
    onIntervalWeeksChange: vi.fn(),
    labels,
    ...overrides,
  };
  let tree!: TestTree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitUnderstanding {...props} />);
  });
  return { tree, props };
}

function button(tree: TestTree, label: string): TestNode {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === "button" &&
      node.props.accessibilityLabel === label,
  )[0]!;
}

function daySelected(tree: TestTree, label: string): boolean {
  return (button(tree, label).props.accessibilityState as { selected: boolean }).selected;
}

describe("HabitUnderstanding mobile", () => {
  it("replaces the phrase border on focus without adding an input border", () => {
    const { tree } = renderUnderstanding();
    const input = tree.root.findAll((node) => node.type === "TextInput")[0]!;
    let layer = input.parent;
    while (layer && StyleSheet.flatten(layer.props.style as ViewStyle).borderWidth === undefined) layer = layer.parent;
    if (!layer) throw new Error('Expected a bordered phrase field');
    expect(StyleSheet.flatten(layer.props.style as ViewStyle).borderWidth).toBe(1);
    TestRenderer.act(() => (input.props.onFocus as () => void)());
    expect(StyleSheet.flatten(layer.props.style as ViewStyle).borderWidth).toBe(2);
    expect(StyleSheet.flatten(input.props.style as TextStyle).borderWidth).toBeUndefined();
    TestRenderer.act(() => (input.props.onBlur as () => void)());
    expect(StyleSheet.flatten(layer.props.style as ViewStyle).borderWidth).toBe(1);
  });

  it("shows every weekday selected for a daily phrase", () => {
    const dayOptions = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      .map((value) => ({ value, label: value.slice(0, 3), accessibleLabel: value }));
    const { tree, props } = renderUnderstanding({
      value: "Read every day at 21h",
      days: [],
      dayOptions,
      daily: true,
      sentence: "Every day at 21:00",
    });

    expect(dayOptions.every((day) => daySelected(tree, day.value))).toBe(true);
    const sixDays = dayOptions.map((day) => day.value).filter((day) => day !== "Monday");
    TestRenderer.act(() => tree.update(<HabitUnderstanding {...props} days={sixDays} daily={false} />));
    expect(daySelected(tree, "Monday")).toBe(false);
    expect(dayOptions.slice(1).every((day) => daySelected(tree, day.value))).toBe(true);
    TestRenderer.act(() => tree.update(<HabitUnderstanding {...props} days={[]} daily />));
    expect(dayOptions.every((day) => daySelected(tree, day.value))).toBe(true);
  });

  it("shows the mirrored placeholder and forwards text entry while empty", () => {
    const { tree, props } = renderUnderstanding();
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "Text" && node.props.children === labels.placeholder,
      ),
    ).toHaveLength(1);
    expect(tree.root.findAll((node) => node.type === "Proposed")).toHaveLength(
      0,
    );

    const input = tree.root.findAll((node) => node.type === "TextInput")[0]!;
    TestRenderer.act(() => {
      (input.props.onChangeText as (value: string) => void)("Run");
    });
    expect(props.onValueChange).toHaveBeenCalledWith("Run");
  });

  it("renders consumed words, proposal copy, errors, and all correction controls", () => {
    const { tree, props } = renderUnderstanding({
      value: "Run Monday",
      error: "A title is required",
      emoji: "🏃",
      days: ["Monday"],
      quantity: 3,
      proposed: true,
      consumed: [{ start: 4, end: 10, kind: "weekday" }],
    });

    expect(
      tree.root.findAll(
        (node) =>
          node.type === "Text" && node.props.children === "A title is required",
      )[0]!.props.accessibilityRole,
    ).toBe("alert");
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "Text" &&
          node.props.children === labels.understoodAstra,
      ),
    ).toHaveLength(1);
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "Text" && node.props.children === labels.unresolved,
      ),
    ).toHaveLength(1);
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "HabitEmojiSelector" &&
          node.props.selectedEmoji === "🏃",
      ),
    ).toHaveLength(1);
    const consumedMonday = tree.root.findAll(
      (node) => node.type === "Text" && node.props.children === "Monday",
    )[0]!;
    const unconsumedPrefix = tree.root.findAll(
      (node) => node.type === "Text" && node.props.children === "Run ",
    )[0]!;
    expect(unconsumedPrefix.props.style).toBeNull();
    expect(consumedMonday.props.style).toMatchObject({
      backgroundColor: tokens.bgWell,
      textDecorationColor: tokens.hairlineStrong,
      textDecorationLine: "underline",
    });

    const monday = button(tree, "Segunda-feira");
    const tuesday = button(tree, "Terça-feira");
    expect(monday.props.accessibilityState).toEqual({ selected: true });
    expect(tuesday.props.accessibilityState).toEqual({ selected: false });
    (monday.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (tuesday.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    TestRenderer.act(() => {
      (monday.props.onPress as () => void)();
    });
    expect(props.onToggleDay).toHaveBeenCalledWith("Monday");
    expect(props.onQuantityChange).not.toHaveBeenCalled();
  });

  it("keeps the weekly quantity positive without imposing a ceiling", () => {
    const lower = renderUnderstanding({ value: "Run", quantity: 1, mode: "flexible" });
    TestRenderer.act(() => {
      (button(lower.tree, labels.less).props.onPress as () => void)();
    });
    expect(lower.props.onQuantityChange).toHaveBeenCalledWith(1);

    const upper = renderUnderstanding({
      value: "Run",
      quantity: 7,
      mode: "flexible",
      sentence: "Seven times a week",
    });
    TestRenderer.act(() => {
      (button(upper.tree, labels.more).props.onPress as () => void)();
    });
    expect(upper.props.onQuantityChange).toHaveBeenCalledWith(8);
    expect(
      upper.tree.root.findAll(
        (node) =>
          node.type === "Text" && node.props.children === "Seven times a week",
      ),
    ).toHaveLength(1);
  });
});

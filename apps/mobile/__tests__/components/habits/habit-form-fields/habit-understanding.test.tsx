import React from "react";
import { describe, expect, it, vi } from "vitest";
import { HabitUnderstanding } from "@/components/habits/habit-form-fields/habit-understanding";
import { createTokensV2 } from "@/lib/theme";

vi.mock("@/lib/use-app-theme", () => ({
  useAppTheme: () => ({ currentScheme: "orange", currentTheme: "light" }),
}));

vi.mock("@/components/ui/icons", () => ({
  Minus: (props: Record<string, unknown>) =>
    React.createElement("Minus", props),
  Plus: (props: Record<string, unknown>) => React.createElement("Plus", props),
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
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}

interface TestTree {
  root: TestNode;
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
  count: "times a week",
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
      { value: "Monday", label: "M" },
      { value: "Tuesday", label: "T" },
    ],
    quantity: 1,
    sentence: null,
    consumed: [],
    onValueChange: vi.fn(),
    onEmojiSelect: vi.fn(),
    onToggleDay: vi.fn(),
    onQuantityChange: vi.fn(),
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

describe("HabitUnderstanding mobile", () => {
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
    expect(consumedMonday.props.style).toMatchObject({
      backgroundColor: tokens.bgWell,
      textDecorationColor: tokens.hairlineStrong,
      textDecorationLine: "underline",
    });

    const monday = button(tree, "Monday");
    const tuesday = button(tree, "Tuesday");
    expect(monday.props.accessibilityState).toEqual({ selected: true });
    expect(tuesday.props.accessibilityState).toEqual({ selected: false });
    (monday.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (tuesday.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    (
      button(tree, labels.less).props.style as (state: {
        pressed: boolean;
      }) => unknown
    )({
      pressed: true,
    });
    (
      button(tree, labels.more).props.style as (state: {
        pressed: boolean;
      }) => unknown
    )({
      pressed: false,
    });

    TestRenderer.act(() => {
      (monday.props.onPress as () => void)();
      (button(tree, labels.less).props.onPress as () => void)();
      (button(tree, labels.more).props.onPress as () => void)();
    });
    expect(props.onToggleDay).toHaveBeenCalledWith("Monday");
    expect(props.onQuantityChange).toHaveBeenNthCalledWith(1, 2);
    expect(props.onQuantityChange).toHaveBeenNthCalledWith(2, 4);
  });

  it("clamps both ends of the weekly quantity correction", () => {
    const lower = renderUnderstanding({ value: "Run", quantity: 1 });
    TestRenderer.act(() => {
      (button(lower.tree, labels.less).props.onPress as () => void)();
    });
    expect(lower.props.onQuantityChange).toHaveBeenCalledWith(1);

    const upper = renderUnderstanding({
      value: "Run",
      quantity: 7,
      sentence: "Seven times a week",
    });
    TestRenderer.act(() => {
      (button(upper.tree, labels.more).props.onPress as () => void)();
    });
    expect(upper.props.onQuantityChange).toHaveBeenCalledWith(7);
    expect(
      upper.tree.root.findAll(
        (node) =>
          node.type === "Text" && node.props.children === "Seven times a week",
      ),
    ).toHaveLength(1);
  });
});

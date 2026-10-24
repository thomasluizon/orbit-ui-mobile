import { expectPressFill } from '../../../support/press-feedback'
import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Yoga from "yoga-layout";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HabitUnderstanding } from "@/components/habits/habit-form-fields/habit-understanding";
import { HABIT_EMOJI_CATEGORIES, buildHabitUnderstandingLabels } from "@orbit/shared/utils";
import { HabitEmojiSelector } from "@/components/habits/habit-form-fields/habit-emoji-selector";
import { createStyles } from "@/components/habits/habit-form-fields/styles";
import { createTokensV2, radius } from "@/lib/theme";

vi.mock("@/lib/use-app-theme", () => ({ useAppTheme: () => ({ currentScheme: "orange", currentTheme: "light" }) }));

const mockCloseSheet = vi.hoisted(() =>
  vi.fn((afterClose?: () => void) => afterClose?.()),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: (props: Record<string, unknown>) =>
    React.createElement(
      "Sheet",
      props,
      props.headerAccessory as React.ReactNode,
      props.children as React.ReactNode,
    ),
  useSheetHost: () => ({
    sheetRef: { current: null },
    closeSheet: mockCloseSheet,
  }),
}));

vi.mock("@/components/ui/bottom-sheet-app-text-input", () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) =>
    React.createElement("TextInput", props),
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
const tokens = createTokensV2();
const styles = createStyles(tokens);
const firstCategory = HABIT_EMOJI_CATEGORIES[0]!;
const firstEmoji = firstCategory.emojis[0]!;

function press(node: TestNode) {
  TestRenderer.act(() => {
    (node.props.onPress as () => void)();
  });
}

function button(tree: TestTree, label: string): TestNode {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === "button" &&
      node.props.accessibilityLabel === label,
  )[0]!;
}

function resolvedStyle(node: TestNode, pressed: boolean): unknown[] {
  return (node.props.style as (state: { pressed: boolean }) => unknown[])({ pressed });
}

function renderSelector(
  selectedEmoji = "",
  onSelect = vi.fn(),
  wellSize?: number,
  isDisabled = false,
) {
  let tree!: TestTree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <HabitEmojiSelector
        selectedEmoji={selectedEmoji}
        tokens={tokens}
        styles={styles}
        onSelect={onSelect}
        wellSize={wellSize}
        isDisabled={isDisabled}
      />,
    );
  });
  return { tree, onSelect };
}

describe("HabitEmojiSelector mobile", () => {
  beforeEach(() => {
    mockCloseSheet.mockClear();
  });

  it('keeps the emoji controls with the empty title and no visible suggestion caption', () => {
    let tree!: TestTree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitUnderstanding value="" emoji="" days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={null} consumed={[]}
        labels={buildHabitUnderstandingLabels(key => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} onSuggestEmoji={vi.fn()} emojiSuggestionHint="Title required" />);
    });
    expect(button(tree, 'habits.form.emojiOpenPicker')).toBeDefined();
    const action = button(tree, 'habits.form.suggestEmoji');
    expect(action.props.disabled).toBe(true);
    expect(action.props.accessibilityHint).toBe('Title required');
    expect(tree.root.findAll(node => node.type === 'Text' && node.props.children === 'Title required')).toHaveLength(0);
    expect(tree.root.findAll(node => node.type === 'Text' && node.props.children === 'habits.form.emoji')).toHaveLength(0);
    const rows = tree.root.findAll(node => node.type === 'View' && node.props.testID === 'habit-title-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.findAll(node => node.type === 'TextInput')).toHaveLength(1);
    expect(rows[0]!.findAll(node => node.props.accessibilityLabel === 'habits.form.emojiOpenPicker').length).toBeGreaterThan(0);
  });

  it.each([393, 1280])('lays out the emoji well after the title at %s', (width) => {
    let tree!: TestTree;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitUnderstanding value="" emoji="" days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={null} consumed={[]}
        labels={buildHabitUnderstandingLabels(key => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} onSuggestEmoji={vi.fn()} />);
    });
    const style = (node: TestNode) => StyleSheet.flatten((typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style) as ViewStyle);
    const titleRow = tree.root.findAll(node => node.type === 'View' && node.props.testID === 'habit-title-row')[0]!;
    const title = titleRow.findAll(node => node.type === 'View' && node.props.style !== undefined && style(node).outlineWidth === 1)[0]!;
    const controls = titleRow.findAll(node => node.type === 'View' && node.props.style !== undefined && style(node).flexDirection === 'row' && node !== titleRow)[0]!;
    const well = titleRow.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')[0]!;
    const astra = titleRow.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.suggestEmoji')[0]!;
    const painted = titleRow.findAll(node => node.type === 'View' && node.props.testID === 'habit-emoji-well')[0]!;
    const row = Yoga.Node.create();
    row.setWidth(Math.min(width, 640) - 32);
    row.setFlexDirection(style(titleRow).flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN);
    row.setGap(Yoga.GUTTER_ALL, style(titleRow).gap as number);
    const field = Yoga.Node.create();
    field.setFlexGrow(style(title).flex);
    field.setFlexBasis(0);
    field.setMinWidth(style(title).minWidth as number);
    field.setHeight(style(title).minHeight as number);
    row.insertChild(field, 0);
    const group = Yoga.Node.create();
    group.setFlexDirection(style(controls).flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN);
    group.setGap(Yoga.GUTTER_ALL, style(controls).gap as number);
    row.insertChild(group, 1);
    const targets = [well, astra].map((host, index) => {
      const target = Yoga.Node.create();
      target.setWidth(style(host).width as number);
      target.setHeight((style(host).height ?? style(host).minHeight) as number);
      group.insertChild(target, index);
      return target;
    });
    try {
      row.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
      expect(group.getComputedLeft()).toBeGreaterThan(field.getComputedLeft() + field.getComputedWidth());
      expect(group.getComputedTop()).toBe(field.getComputedTop());
      expect(group.getComputedHeight()).toBeLessThanOrEqual(field.getComputedHeight());
      expect(group.getComputedLeft() + group.getComputedWidth()).toBeLessThanOrEqual(row.getComputedWidth());
      expect(targets[1]!.getComputedLeft()).toBeGreaterThan(targets[0]!.getComputedWidth());
      expect(style(painted)).toMatchObject({ width: 46, height: 46, backgroundColor: createTokensV2("orange", "light").bgWell });
    } finally { row.freeRecursive(); }
  });

  it("filters, clears, and toggles a category in the picker", () => {
    const { tree } = renderSelector();
    const opener = button(tree, "habits.form.emojiOpenPicker");
    expect(resolvedStyle(opener, true)).toContainEqual({ transform: [{ scale: 0.96 }] });
    expect(resolvedStyle(opener, false).at(-1)).toBeNull();
    press(opener);

    const search = tree.root.findAll((node) => node.type === "TextInput")[0]!;
    TestRenderer.act(() => {
      (search.props.onChangeText as (value: string) => void)(
        "not-an-emoji-query",
      );
    });
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "Text" &&
          node.props.children === "habits.form.emojiPickerEmpty",
      ),
    ).toHaveLength(1);
    press(button(tree, "habits.form.emojiClearSearch"));
    expect(search.props.value).toBe("");

    const category = button(tree, firstCategory.labelKey);
    expect(resolvedStyle(category, true)).toContainEqual(expect.objectContaining({
      transform: [{ scale: 0.96 }],
    }));
    press(category);
    expect(category.props.accessibilityState).toEqual({ selected: true });
    expect(resolvedStyle(category, false).at(-1)).toBeNull();
    press(category);
    expect(category.props.accessibilityState).toEqual({ selected: false });

    const sheet = tree.root.findAll((node) => node.type === "Sheet")[0]!;
    TestRenderer.act(() => {
      (sheet.props.onClose as () => void)();
    });
    expect(tree.root.findAll((node) => node.type === "Sheet")).toHaveLength(0);
  });

  it("selects and removes emoji values after the sheet closes", () => {
    const selection = renderSelector();
    press(button(selection.tree, "habits.form.emojiOpenPicker"));
    press(button(selection.tree, `habits.form.emoji: ${firstEmoji}`));
    expect(selection.onSelect).toHaveBeenCalledWith(firstEmoji);

    const removal = renderSelector(firstEmoji, vi.fn(), 76);
    press(button(removal.tree, "habits.form.emojiOpenPicker"));
    const selectedOption = button(
      removal.tree,
      `habits.form.emoji: ${firstEmoji}`,
    );
    expect(selectedOption.props.accessibilityState).toEqual({ selected: true });
    expect(resolvedStyle(selectedOption, true)).toContainEqual(expect.objectContaining({
      transform: [{ scale: 0.96 }],
    }));
    expect(resolvedStyle(selectedOption, false).at(-1)).toBeNull();
    const remove = button(removal.tree, "habits.form.emojiRemove");
    expect(resolvedStyle(remove, true)).toContainEqual(expect.objectContaining({
      transform: [{ scale: 0.96 }],
    }));
    expect(resolvedStyle(remove, false).at(-1)).toBeNull();
    press(remove);
    expect(removal.onSelect).toHaveBeenCalledWith("");
    expect(mockCloseSheet).toHaveBeenCalledTimes(1);
  });

  it("disables manual emoji changes while a suggestion is pending", () => {
    const { tree, onSelect } = renderSelector("", vi.fn(), undefined, true);
    const opener = button(tree, "habits.form.emojiOpenPicker");

    expect(opener.props.disabled).toBe(true);
    expect(opener.props.accessibilityState).toEqual({ disabled: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(tree.root.findAll((node) => node.type === "Sheet")).toHaveLength(0);
  });
});

it('fills the picker controls, selected and idle options, and clear search', () => {
  const { tree } = renderSelector(firstEmoji);
  expectPressFill(tree, 'habits.form.emojiOpenPicker', tokens.bgHover, 12);
  press(button(tree, 'habits.form.emojiOpenPicker'));
  expectPressFill(tree, 'habits.form.emojiRemove', tokens.bgHover, 999);
  expectPressFill(tree, firstCategory.labelKey, tokens.bgHover, radius.full);
  press(button(tree, firstCategory.labelKey));
  expectPressFill(tree, firstCategory.labelKey, tokens.bgHover, radius.full);
  expectPressFill(tree, `habits.form.emoji: ${firstEmoji}`, tokens.bgHover, 12);
  expectPressFill(tree, `habits.form.emoji: ${firstCategory.emojis[1]!}`, tokens.bgHover, 12);
  const search = tree.root.findAll((node) => node.type === 'TextInput')[0]!;
  TestRenderer.act(() => (search.props.onChangeText as (value: string) => void)('run'));
  expectPressFill(tree, 'habits.form.emojiClearSearch', tokens.bgHover, 999);
});

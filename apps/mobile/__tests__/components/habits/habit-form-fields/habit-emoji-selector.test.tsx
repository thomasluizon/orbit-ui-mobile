import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HABIT_EMOJI_CATEGORIES } from "@orbit/shared/utils";
import { HabitEmojiSelector } from "@/components/habits/habit-form-fields/habit-emoji-selector";
import { createStyles } from "@/components/habits/habit-form-fields/styles";
import { createTokensV2 } from "@/lib/theme";

const mockCloseSheet = vi.hoisted(() =>
  vi.fn((afterClose?: () => void) => afterClose?.()),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: (props: Record<string, unknown>) =>
    React.createElement("Sheet", props, props.children as React.ReactNode),
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

function renderSelector(
  selectedEmoji = "",
  onSelect = vi.fn(),
  wellSize?: number,
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
      />,
    );
  });
  return { tree, onSelect };
}

describe("HabitEmojiSelector mobile", () => {
  beforeEach(() => {
    mockCloseSheet.mockClear();
  });

  it("filters, clears, and toggles a category in the picker", () => {
    const { tree } = renderSelector();
    const opener = button(tree, "habits.form.emojiOpenPicker");
    (opener.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (opener.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
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
    (category.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    press(category);
    expect(category.props.accessibilityState).toEqual({ selected: true });
    (category.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
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
    (selectedOption.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (selectedOption.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    const remove = button(removal.tree, "habits.form.emojiRemove");
    (remove.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (remove.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    press(remove);
    expect(removal.onSelect).toHaveBeenCalledWith("");
    expect(mockCloseSheet).toHaveBeenCalledTimes(2);
  });
});

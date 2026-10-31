import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SCHEDULED_REMINDERS } from "@orbit/shared/validation";
import type { ScheduledReminderWhen } from "@orbit/shared/types/habit";
import { createTokensV2 } from "@/lib/theme";
import { ScheduledReminderSection } from "@/components/habits/habit-form-fields/scheduled-reminder-section";
import { buildCreateHabitRequest, buildEmptyHabitFormValues } from "@orbit/shared/utils";

const pushPermission = vi.hoisted(() => ({ status: "granted", includeTime: false, language: 'pt-BR', uses24HourClock: false }));
vi.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({
    isSupported: true,
    permissionStatus: pushPermission.status,
    permissionCanAskAgain: true,
    requestPermissionOutcome: vi.fn(),
  }),
}));

afterEach(() => { pushPermission.status = "granted"; pushPermission.includeTime = false; pushPermission.language = 'pt-BR'; pushPermission.uses24HourClock = false; });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => pushPermission.includeTime && params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: pushPermission.language },
  }),
}));

vi.mock("@/hooks/use-profile", () => ({ useProfile: () => ({ profile: { uses24HourClock: pushPermission.uses24HourClock } }) }));

vi.mock("@/components/ui/time-field", () => ({
  TimeField: (props: Record<string, unknown>) =>
    React.createElement("TimeField", props),
}));

vi.mock("@/components/ui/switch", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/ui/switch")>(),
  Switch: (props: Record<string, unknown>) =>
    React.createElement("Switch", props),
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

type Reminder = { when: ScheduledReminderWhen; time: string };

function render(overrides: {
  reminderEnabled?: boolean;
  scheduledReminders?: Reminder[] | undefined;
  nested?: boolean;
  hideDayBefore?: boolean;
  onSetScheduledReminders?: (reminders: Reminder[]) => void;
  onValidationError?: (message: string) => void;
}) {
  const onSetScheduledReminders = overrides.onSetScheduledReminders ?? vi.fn();
  const onValidationError = overrides.onValidationError ?? vi.fn();
  let tree!: TestTree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <ScheduledReminderSection
        tokens={tokens}
        reminderEnabled={overrides.reminderEnabled ?? true}
        scheduledReminders={overrides.scheduledReminders}
        onToggleReminder={vi.fn()}
        onSetScheduledReminders={onSetScheduledReminders}
        onValidationError={onValidationError}
        nested={overrides.nested}
        hideDayBefore={overrides.hideDayBefore}
      />,
    );
  });
  return { tree, onSetScheduledReminders, onValidationError };
}

function press(node: TestNode) {
  TestRenderer.act(() => {
    (node.props as { onPress: () => void }).onPress();
  });
}

function buttons(tree: TestTree): TestNode[] {
  return tree.root.findAll((node) => node.props.accessibilityRole === "button");
}

function buttonWithLabel(tree: TestTree, label: string): TestNode | undefined {
  return buttons(tree).find((node) => node.props.accessibilityLabel === label);
}

function texts(tree: TestTree): unknown[] {
  return tree.root
    .findAll((node) => node.type === "Text")
    .map((node) => node.props.children);
}

describe("ScheduledReminderSection", () => {
  it("makes the blocked permission sentence one padded settings control", () => {
    pushPermission.status = "denied";
    const { tree } = render({ reminderEnabled: true });
    const controls = tree.root.findAll((node) => node.type === "Pressable" && node.props.accessibilityLabel === "habits.form.reminderPermissionNeeded");
    expect(controls).toHaveLength(1);
    const control = controls[0]!;
    expect(control.props.accessibilityRole).toBe("button");
    expect(control.props.accessibilityHint).toBe("habits.form.reminderSettingsHint");
    const liveText = control.findAll((node) => node.type === "Text" && node.props.accessibilityLiveRegion === "polite");
    expect(liveText).toHaveLength(1);
    expect(liveText[0]!.props.children).toBe(control.props.accessibilityLabel);
    const styles = control.props.style as (state: { pressed: boolean }) => ViewStyle[];
    const resting = StyleSheet.flatten(styles({ pressed: false }));
    const pressed = StyleSheet.flatten(styles({ pressed: true }));
    expect(resting.minHeight).toBe(48);
    expect(pressed.backgroundColor).toBe(tokens.bgHover);
    expect(pressed.paddingHorizontal).toBeGreaterThanOrEqual(8);
    expect(pressed.paddingVertical).toBeGreaterThanOrEqual(4);
    TestRenderer.act(() => (control.props.onHoverIn as () => void)());
    const hovered = StyleSheet.flatten((control.props.style as typeof styles)({ pressed: false }));
    expect(hovered).toMatchObject({ backgroundColor: tokens.bgHover, paddingHorizontal: 8, paddingVertical: 8 });
    TestRenderer.act(() => (control.props.onHoverOut as () => void)());
    TestRenderer.act(() => (control.props.onFocus as () => void)());
    expect(StyleSheet.flatten((control.props.style as typeof styles)({ pressed: false }))).toMatchObject({ outlineWidth: 2, outlineColor: tokens.fg1 });
    TestRenderer.act(() => (control.props.onBlur as () => void)());
    expect(tree.root.findAll((node) => node.type === "Text" && node.props.children === "common.openSettings")).toHaveLength(0);
  });

  it("hides the body while reminders are disabled", () => {
    const { tree } = render({ reminderEnabled: false });
    expect(texts(tree)).not.toContain("habits.form.scheduledReminderAdd");
  });

  it("omits its own switch when nested under the offset card", () => {
    const { tree } = render({ nested: true });
    expect(tree.root.findAll((node) => node.type === "Switch")).toHaveLength(0);
  });

  it("labels a same-day reminder distinctly from a day-before one", () => {
    const { tree } = render({
      scheduledReminders: [
        { when: "same_day", time: "09:00" },
        { when: "day_before", time: "20:00" },
      ],
    });
    expect(texts(tree)).toContain("habits.form.scheduledReminderSameDayAt");
    expect(texts(tree)).toContain("habits.form.scheduledReminderDayBeforeAt");
  });

  it.each([
    ['pt-BR', false, '7:30 PM', '19:30'],
    ['en', true, '19:30', '7:30 PM'],
  ])("shows fixed reminder times with %s and the saved clock", (language, uses24HourClock, expected, excluded) => {
    pushPermission.language = language;
    pushPermission.uses24HourClock = uses24HourClock;
    pushPermission.includeTime = true;
    const { tree } = render({ scheduledReminders: [{ when: "same_day", time: "19:30" }] });
    expect(JSON.stringify(texts(tree))).toContain(expected);
    expect(JSON.stringify(texts(tree))).not.toContain(excluded);
  });

  it("removes a scheduled reminder by index", () => {
    const { tree, onSetScheduledReminders } = render({
      scheduledReminders: [
        { when: "same_day", time: "09:00" },
        { when: "day_before", time: "20:00" },
      ],
    });
    const remove = buttonWithLabel(
      tree,
      "habits.form.removeScheduledReminder",
    )!;
    (remove.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (remove.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    press(remove);
    expect(onSetScheduledReminders).toHaveBeenCalledWith([
      { when: "day_before", time: "20:00" },
    ]);
  });

  it('adds a picked time with a visible label and no orphan actions', () => {
    const { tree, onSetScheduledReminders } = render({ scheduledReminders: [] })
    const picker = tree.root.findAll((node) => node.type === 'TimeField')[0]!
    expect(picker.props.label).toBe('habits.form.scheduledReminderTime')
    expect(picker.props.placeholder).toBe('habits.form.scheduledReminderTimePlaceholder')
    expect(buttonWithLabel(tree, 'common.add')).toBeUndefined()
    expect(buttonWithLabel(tree, 'common.cancel')).toBeUndefined()
    TestRenderer.act(() => (picker.props as { onChange: (value: string) => void }).onChange('09:00'))
    expect(onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'same_day', time: '09:00' }])
  })

  it('rejects duplicate and invalid times on selection', () => {
    const { tree, onValidationError, onSetScheduledReminders } = render({ scheduledReminders: [{ when: 'same_day', time: '09:00' }] })
    const picker = tree.root.findAll((node) => node.type === 'TimeField')[0]!
    TestRenderer.act(() => (picker.props as { onChange: (value: string) => void }).onChange('09:00'))
    expect(onValidationError).toHaveBeenLastCalledWith('habits.form.duplicateScheduledReminder')
    TestRenderer.act(() => (picker.props as { onChange: (value: string) => void }).onChange('25:61'))
    expect(onValidationError).toHaveBeenLastCalledWith('habits.form.invalidScheduledReminderTime')
    expect(onSetScheduledReminders).not.toHaveBeenCalled()
  })

  it('hides day-before for today without removing stored clocks', () => {
    const { tree, onSetScheduledReminders } = render({ hideDayBefore: true, scheduledReminders: [{ when: 'day_before', time: '20:00' }] })
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'habits.form.scheduledReminderDayBefore')).toHaveLength(0)
    const picker = tree.root.findAll((node) => node.type === 'TimeField')[0]!
    TestRenderer.act(() => (picker.props as { onChange: (value: string) => void }).onChange('09:00'))
    expect(onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'day_before', time: '20:00' }, { when: 'same_day', time: '09:00' }])
  })

  it("shows the max notice and hides the add button at the reminder limit", () => {
    const full: Reminder[] = Array.from(
      { length: MAX_SCHEDULED_REMINDERS },
      (_, index) => ({
        when: "same_day" as const,
        time: `0${index}:00`,
      }),
    );
    const { tree } = render({ scheduledReminders: full });
    expect(texts(tree)).toContain("habits.form.scheduledReminderMax");
  });

  it('adds a day-before time to the relative request', () => {
    const { tree, onSetScheduledReminders } = render({ scheduledReminders: [], nested: true })
    press(tree.root.findAll((node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'habits.form.scheduledReminderDayBefore')[0]!)
    const picker = tree.root.findAll((node) => node.type === 'TimeField')[0]!
    TestRenderer.act(() => {
      ;(picker.props as { onChange: (value: string) => void }).onChange('18:00')
    })
    expect(onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'day_before', time: '18:00' }])
    const form = {
      ...buildEmptyHabitFormValues('2025-03-10'),
      dueTime: '09:00',
      reminderEnabled: true,
      scheduledReminders: [{ when: 'day_before' as const, time: '18:00' }],
    }
    expect(buildCreateHabitRequest(form, [], [], [], []).relativeReminders).toEqual([
      { when: 'day_before', time: '18:00' },
    ])
  })
});

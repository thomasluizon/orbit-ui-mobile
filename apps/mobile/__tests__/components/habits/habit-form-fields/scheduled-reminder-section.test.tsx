import React from "react";
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

vi.mock("@/components/ui/switch", () => ({
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
  it("shows the settings action for a blocked scheduled reminder", () => {
    pushPermission.status = "denied";
    const { tree } = render({ reminderEnabled: true });
    expect(texts(tree)).toContain("habits.form.reminderPermissionNeeded");
    expect(texts(tree)).toContain("common.openSettings");
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

  it("rejects adding a reminder with no time selected", () => {
    const { tree, onValidationError, onSetScheduledReminders } = render({
      scheduledReminders: [],
    });
    const reveal = buttons(tree).find(
      (node) => !node.props.accessibilityLabel,
    )!;
    (reveal.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (reveal.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    press(reveal);
    const add = buttons(tree).find(
      (node) => !node.props.accessibilityLabel && node.props.disabled === true,
    );
    (add!.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (add!.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    press(add!);
    expect(onValidationError).toHaveBeenCalledWith(
      "habits.form.invalidScheduledReminderTime",
    );
    expect(onSetScheduledReminders).not.toHaveBeenCalled();
  });

  it("adds a valid same-day reminder and resets the form", () => {
    const { tree, onSetScheduledReminders } = render({
      scheduledReminders: undefined,
    });
    press(buttons(tree).find((node) => !node.props.accessibilityLabel)!);
    const picker = tree.root.findAll((node) => node.type === "TimeField")[0]!;
    TestRenderer.act(() => {
      (picker.props as { onClear: () => void }).onClear();
      (picker.props as { onChange: (value: string) => void }).onChange("09:00");
    });
    const radios = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio');
    expect(tree.root.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'radiogroup')).toHaveLength(1);
    expect(radios.map((node) => node.props.accessibilityState)).toEqual([{ checked: false }, { checked: true }]);
    const [dayBefore, sameDay] = radios;
    press(dayBefore!);
    expect(dayBefore!.props.accessibilityState).toEqual({ checked: true });
    expect(sameDay!.props.accessibilityState).toEqual({ checked: false });
    press(sameDay!);
    const add = buttons(tree).find(
      (node) => !node.props.accessibilityLabel && node.props.disabled === false,
    );
    (add!.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (add!.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    press(add!);
    expect(onSetScheduledReminders).toHaveBeenCalledWith([
      { when: "same_day", time: "09:00" },
    ]);
  });

  it("reports a duplicate scheduled reminder from validation", () => {
    const { tree, onValidationError, onSetScheduledReminders } = render({
      scheduledReminders: [{ when: "same_day", time: "09:00" }],
    });
    press(buttons(tree).find((node) => !node.props.accessibilityLabel)!);
    const picker = tree.root.findAll((node) => node.type === "TimeField")[0]!;
    TestRenderer.act(() => {
      (picker.props as { onChange: (value: string) => void }).onChange("09:00");
    });
    press(
      buttons(tree).find(
        (node) =>
          !node.props.accessibilityLabel && node.props.disabled === false,
      )!,
    );
    expect(onValidationError).toHaveBeenCalledWith(
      "habits.form.duplicateScheduledReminder",
    );
    expect(onSetScheduledReminders).not.toHaveBeenCalled();
  });

  it("cancels a pending scheduled reminder and clears its time", () => {
    const { tree, onSetScheduledReminders } = render({
      scheduledReminders: [],
    });
    press(buttons(tree).find((node) => !node.props.accessibilityLabel)!);
    const picker = tree.root.findAll((node) => node.type === "TimeField")[0]!;
    TestRenderer.act(() => {
      (picker.props as { onChange: (value: string) => void }).onChange("17:30");
    });
    const cancel = buttonWithLabel(tree, "common.cancel")!;
    (cancel.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: true,
    });
    (cancel.props.style as (state: { pressed: boolean }) => unknown)({
      pressed: false,
    });
    press(cancel);
    expect(tree.root.findAll((node) => node.type === "TimeField")).toHaveLength(
      0,
    );
    press(buttons(tree).find((node) => !node.props.accessibilityLabel)!);
    const reopenedPicker = tree.root.findAll(
      (node) => node.type === "TimeField",
    )[0]!;
    expect(reopenedPicker.props.value).toBe("");
    expect(onSetScheduledReminders).not.toHaveBeenCalled();
  });

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
    press(buttons(tree).find((node) =>
      node.findAll((child) => child.type === 'Text' && child.props.children === 'habits.form.reminderAddTime').length > 0)!)
    press(tree.root.findAll((node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'habits.form.scheduledReminderDayBefore')[0]!)
    const picker = tree.root.findAll((node) => node.type === 'TimeField')[0]!
    TestRenderer.act(() => {
      ;(picker.props as { onChange: (value: string) => void }).onChange('18:00')
    })
    press(buttons(tree).find((node) => !node.props.accessibilityLabel && node.props.disabled === false)!)
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

# Headless control surfaces

**At a glance:** paired selection, picker, tab, toast and form-control owners, primitive
boundaries, retained behavior and verification coverage.

## Primitive boundary

Web selection and controls use individual Radix packages. Native selection and controls use
rn-primitives. Orbit supplies the existing tokens, labels, layout and feedback. The existing
Base UI Dialog and native TrueSheet adapters continue to own dialogs.

| Surface | Composition | Retained behavior |
| --- | --- | --- |
| Reminder units and direction | Paired Select Root, Trigger, Content and Item | Named selected value, first activation after editing, disabled state and custom reminder validation |
| Web select popup | Radix Select, with its portal inside the owning dialog when present | Arrow navigation, typeahead, selection, Escape and trigger focus restoration |
| Native select choices | rn-primitives Select Root, Trigger and Item inside a nested Sheet | Native presentation above the form sheet, option selection and value commit after completed dismissal |
| Both year pickers | Existing three-column grid inside its owner's Sheet | Selected-year announcement, scroll reveal, 48px cells and 52px pitch including the 4px gap |
| Both date fields | Existing calendar grid inside Sheet | Draft selection, month and year navigation, date bounds, clear and Done |
| Both time fields | Existing bounded multi-column grid inside Sheet, with headless radio items | Localized typed entry, selected hour/minute, drag ownership, draft and Done |
| Both PickerRow surfaces | Checkbox primitive around the object selection target | Selected state, proposed label feedback, disabled state and separate value/actions |
| Both segmented controls and HabitViewSwitch consumers | Tabs primitives | Named current tab, disabled options and view changes; web roving navigation; native individually focusable tabs |
| Both RadioRow surfaces and their callers | Radio group primitives | Existing names, selected state, disabled reasons, personal text disclosure and explicit activation commits |
| Settings ListRow switches | Switch primitives | Existing row name, checked state, pending state and target geometry |
| Both Checkbox components | Checkbox primitives | Existing name, checked/error/loading state and decorative box mode |
| Both ThemeToggle components | Toggle primitives | Existing localized action name and theme state |
| Web Toast and AppToastHost | Radix toast Root, Action, Close and Viewport | Queue order, lifetime contract, reachable actions, no mount focus and polite/assertive announcements |
| Native Toast and AppToast | rn-primitives toast Root, Action and Close | Existing lifetime/store adapters, swipe dismissal, no mount focus and Android live-region announcements |

## Selection and dismissal

Native select content uses the existing Sheet presentation rather than a root portal or a native
window host. Its Items leave the primitive open until the native sheet completes dismissal;
only then does the selected value reach the caller. The parent form keeps its keyboard-aware
scroll owner and handled-tap policy.

The native focus provider retains entry provenance and selection on directional focus for radio
options and tabs. Each enabled option remains a real platform focus target. There is no invisible
roving target. The primitives own press semantics and selected state.

Web radio navigation comes from Radix. The adapter retains selected-item entry, Home/End selection
and Enter activation, and separates navigation-driven selection from the explicit commit used by
preference sheets. Personal text keeps its independent arrow-key behavior.

Toast lifetime remains the shared application contract so native and web keep the same timeout,
pause and navigation rules. Primitive action activation retains caller ownership of completion;
a retry does not disappear before its operation finishes. Native toast Root uses background type
with explicit announcement priority so mounting feedback never requests accessibility focus.

## Verification boundary

Focused Vitest suites exercise the production parts and owning compositions. Existing date,
time and year suites retain the picker geometry and draft/Done coverage. Headless Chromium runs
only within the repository's Vitest geometry suites. Host tests establish component contracts;
they do not establish installed-device keyboard routing, native sheet layering or TalkBack output.

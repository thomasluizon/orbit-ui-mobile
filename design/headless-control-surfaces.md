# Headless control surfaces

**At a glance:** paired selection, picker, toast and form-control owners, primitive
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
| Both date fields | Existing calendar grid inside Sheet | Selected-date announcement, month and year navigation, web calendar keyboard navigation and value commit after dismissal |
| Both time fields | Existing bounded multi-column grid inside Sheet, with headless radio items | Localized typed entry, selected hour/minute, drag ownership, draft and Done |
| Both PickerRow surfaces | Toggle primitive around the object selection target | Selected state, proposed label feedback, disabled state and separate value/actions |
| Both segmented controls and HabitViewSwitch consumers | Radio group primitives | Named checked value, disabled options and view changes; web roving navigation; native individually focusable radios |
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
options. Each enabled option remains a real platform focus target. There is no invisible
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

## Modal composition and pending controls

The menu sheet alone marks its Popper content with `data-menu-sheet`. The sheet stylesheet
flattens only that marked wrapper; a Select portal stays inside the dialog and keeps its
positioning box. Mounted Chromium coverage uses the real Sheet, stylesheet and selection parts.

Busy radio items keep their DOM or native control enabled and focusable, announce an unavailable
state, and reject selection and explicit commits. Web busy keys cannot navigate the group.
Permanent disabled options keep their existing noninteractive presentation. Parent-choice
coverage checks pending focus, next-choice continuation, approval continuation, failed revision
and focus moved outside the preview.

Toast announcements use the viewport's parent as their container, keeping them inside the modal
accessible subtree. Escape outside a toast belongs to its containing overlay and preserves the
queued action. The primitive still handles Escape from its own controls.

## Dependency interface evidence

The Radix utility overrides keep each utility at one physical module path across the selected
primitives. Dropdown Menu uses the same utility family as Select, Radio Group and Toast.
The lockfile retains unrelated dependency versions.

Re-derive the consumed interfaces from the installed packages:

- `@radix-ui/react-radio-group/dist/index.js`, `RadioTrigger` and `RadioGroupItemTrigger`:
  `disabled` reaches the native button and removes it from roving focus. Consumer event handlers
  run before internal activation and respect `preventDefault`.
- `@rn-primitives/radio-group/dist/radio-group.js`, `Item`: the primitive checks `disabled`,
  calls `onValueChange(itemValue)`, then `onPress`. Selection therefore guards the registered
  unavailable item before the primitive can commit.
- `@radix-ui/react-toast/dist/index.js`, `ToastProvider`, `ToastAnnounce` and `ToastImpl`:
  `announcerContainer` controls the announcement portal, and `onEscapeKeyDown` precedes the
  primitive close callback. `dist/index.d.ts` declares the container as an element or document
  fragment. Escape from an unrelated control also reaches the primitive's dismissal listener.
- `@radix-ui/react-select/dist/index.js`, `SelectPopperPosition`: the complete runtime property
  mapping is content transform origin to Popper transform origin, content available width and
  height to Popper available width and height, and trigger width and height to Popper anchor
  width and height. The custom-property test recognizes the two properties this adapter uses.

The jsdom form adapter dispatches Enter and requests submission through the associated footer
button. The installed `@testing-library/user-event/dist/cjs/event/behavior/keypress.js` only
searches descendants for a submit button and otherwise requires a single input; primitive radio
inputs expose that limitation. Mounted Chromium coverage verifies the real associated footer
submission without that adapter.

Web segmented controls keep the shipped radiogroup, radio and checked-state semantics. Arrow keys
select while ordinary focus inspection preserves the value and the Today pager. The group itself
is not a keyboard stop. Native options retain individual focus targets and checked announcements.
Picker rows retain toggle-button selection with separate personal-text disclosure actions.

Form proxy inputs remain in forms for change events and serialization, but carry no layout box.
Only their named visible control participates in field measurement and pointer interaction.

The segmented-control and picker-row interfaces can be re-derived from these installed sources:

- `@radix-ui/react-radio-group/dist/index.mjs`, `RadioTrigger`, `RadioGroup` and
  `RadioGroupItemTrigger`: buttons expose `role="radio"` and boolean `aria-checked`, the root
  exposes `role="radiogroup"`, and arrow-driven focus clicks the enabled item. Roving navigation
  queues focus in `@radix-ui/react-roving-focus/dist/index.mjs`, `RovingFocusGroupItem`.
  The adapter clears its navigation key after that task so stationary Home/End presses cannot
  turn later ordinary focus into selection.
- `@rn-primitives/radio-group/dist/radio-group.js`, `Root` and `Item`: the root exposes
  `role="radiogroup"`; items expose `role="radio"`, boolean `aria-checked` and
  `accessibilityState` with boolean `checked` and `disabled`. Press calls `onValueChange`.
- `@radix-ui/react-toggle/dist/index.mjs`, `Toggle`: a button exposes boolean `aria-pressed`
  and calls `onPressedChange` only when enabled. `@rn-primitives/toggle/dist/toggle.js`, `Root`,
  supplies checked switch defaults; the native picker adapter replaces those with its existing
  button role and selected state.
- `@radix-ui/react-checkbox/dist/index.mjs`, `CheckboxBubbleInput`, and
  `@radix-ui/react-switch/dist/index.mjs`, `SwitchBubbleInput`: form proxies expose
  `aria-hidden="true"`, `tabIndex=-1` and opacity zero. Radio proxies use the same attributes;
  Select uses an aria-hidden select. The stylesheet removes these nonvisual layout boxes.

Direct tabs dependencies are removed. The lockfile retains the Radix tabs dependency required
by the native routing package.

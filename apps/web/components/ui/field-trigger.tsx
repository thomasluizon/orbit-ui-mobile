/**
 * A button drawn as a field (the date trigger, the select trigger, the sidebar search) keeps the
 * `DESIGN.md` web text field perimeter: `--border-control` on `::after`, so it paints above the
 * `FieldTriggerFill` layer and a hover or press never tints it. Keyboard focus swaps it for the
 * inset 2px `--primary` outline at once. The button also renders `FieldTriggerFill` as its last child.
 */
export const FIELD_TRIGGER_PERIMETER = 'group relative isolate after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--border-control)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] focus-visible:after:shadow-none'

/**
 * `--fg-3` content inside a field trigger (a placeholder, a trailing icon) promotes to `--fg-2` while the
 * `FieldTriggerFill` layer shows, so it keeps its contrast floor over the stronger fill, timed like the fill. Like the fill,
 * it stays at rest while the trigger is disabled, by its own attribute or by a `<fieldset disabled>`.
 */
export const FIELD_TRIGGER_MUTED_CONTENT = 'transition-[color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-enabled:group-hover:text-[var(--fg-2)] group-enabled:group-active:text-[var(--fg-2)]'

/**
 * `DESIGN.md`: a control with an opaque resting fill layers `--bg-hover-opaque` over that fill, on a
 * fine pointer hover and on every press. The layer sits below the content and hides while disabled.
 */
export function FieldTriggerFill() {
  return <span data-press-fill="" aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-transparent transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover:bg-[var(--bg-hover-opaque)] group-active:bg-[var(--bg-hover-opaque)] group-disabled:hidden" />
}

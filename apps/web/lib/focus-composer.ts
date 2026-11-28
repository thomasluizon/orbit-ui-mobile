/** Moves focus to the composer input. A block that closes calls this so the keyboard user lands on the next control. */
export function focusComposerInput(): void {
  document.querySelector<HTMLElement>('[data-composer-root] [data-composer-input]:not([disabled])')?.focus()
}

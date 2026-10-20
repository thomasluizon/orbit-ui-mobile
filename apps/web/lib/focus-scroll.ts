export function revealFocusedControl(event: { target: Element }) {
  event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

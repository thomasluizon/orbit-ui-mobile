export function revealFocusedControl(event: { target: Element }) {
  const surface = event.target.matches('.orbit-list-row-body') ? event.target.closest('.orbit-list-action-surface') : null
  const target = surface ?? event.target
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

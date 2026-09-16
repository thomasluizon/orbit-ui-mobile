export function resolveCenteredOverlayFrame(screenWidth: number, maxWidth: number) {
  const width = Math.min(screenWidth - 32, maxWidth)
  return { left: (screenWidth - width) / 2, width }
}

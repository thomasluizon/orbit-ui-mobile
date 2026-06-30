export async function captureRef(): Promise<string> {
  return 'file:///cache/share-card.png'
}

export function releaseCapture(): void {}

export async function captureScreen(): Promise<string> {
  return 'file:///cache/screen.png'
}

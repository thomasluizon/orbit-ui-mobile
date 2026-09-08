export function captureRef(): Promise<string> {
  return Promise.resolve('file:///cache/share-card.png')
}

export function releaseCapture(): void {}

export function captureScreen(): Promise<string> {
  return Promise.resolve('file:///cache/screen.png')
}

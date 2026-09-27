let connectionId: string | null = null

export function getAccountEventOrigin(): string | null {
  return connectionId
}

export function setAccountEventOrigin(nextConnectionId: string | null): void {
  connectionId = nextConnectionId
}

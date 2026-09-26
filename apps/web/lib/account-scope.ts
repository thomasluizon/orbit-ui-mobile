let accountId: string | null = null

export function setAccountId(nextAccountId: string | null): void {
  accountId = nextAccountId
}

export function getAccountId(): string | null {
  return accountId
}

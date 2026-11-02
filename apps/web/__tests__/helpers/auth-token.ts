export function makeAccessToken(accountId: string): string {
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      exp: Math.floor(Date.now() / 1000) + 3600,
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': accountId,
    }),
    'ZmFrZS1zaWduYXR1cmU',
  ].join('.')
}

export const ACCOUNT_A_ACCESS_TOKEN = makeAccessToken('account-a')

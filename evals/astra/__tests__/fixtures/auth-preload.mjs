globalThis.fetch = async (url) => {
  if (new URL(url).pathname === '/api/auth/refresh') {
    return Response.json({ token: 'offline-token', refreshToken: 'offline-refresh' })
  }
  throw new Error('Unexpected offline HTTP request.')
}

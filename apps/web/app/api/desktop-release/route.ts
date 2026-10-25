import compatibility from '@/web-compatibility.json'

export function GET() {
  return Response.json({ commit: process.env.WEB_COMMIT_SHA ?? null, ...compatibility }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

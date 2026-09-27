export function GET() {
  return Response.json({ status: 'ok', commit: process.env.WEB_COMMIT_SHA ?? null })
}

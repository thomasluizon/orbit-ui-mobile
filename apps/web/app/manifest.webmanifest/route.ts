import { createManifest } from '@/lib/manifest'

export async function GET() {
  return Response.json(await createManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'private, no-store',
    },
  })
}

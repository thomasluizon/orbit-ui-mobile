// WHY: github.com/<repository>/releases/download answers 504 for hours during GitHub outages while the REST asset endpoint keeps serving the same bytes.
const apiRoot = 'https://api.github.com'
const attempts = 4
const requestTimeoutMilliseconds = 30_000

export type Sleep = (milliseconds: number) => Promise<void>

export interface ReleaseAssets {
  assets: { id: number; name: string }[]
}

export class ReleaseAssetError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const defaultSleep: Sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

async function requestWithRetries(url: string, accept: string, sleep: Sleep): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept }
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`
  let failure = 'no attempt ran'
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(requestTimeoutMilliseconds) })
      if (!retryable(response.status)) return response
      failure = `status ${response.status}`
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1))
  }
  throw new ReleaseAssetError(503, `${url} failed after ${attempts} attempts: ${failure}`)
}

export async function findRelease(repository: string, tag: string, sleep: Sleep = defaultSleep): Promise<ReleaseAssets | null> {
  const response = await requestWithRetries(`${apiRoot}/repos/${repository}/releases/tags/${tag}`, 'application/vnd.github+json', sleep)
  if (response.status === 404) return null
  if (!response.ok) throw new ReleaseAssetError(response.status, `Cannot look up ${repository} release ${tag}: ${response.status}`)
  return await response.json() as ReleaseAssets
}

export async function downloadReleaseAsset(repository: string, release: ReleaseAssets, name: string, sleep: Sleep = defaultSleep): Promise<Buffer> {
  const asset = release.assets.find(candidate => candidate.name === name)
  if (!asset) throw new ReleaseAssetError(404, `${repository} release has no asset ${name}`)
  const response = await requestWithRetries(`${apiRoot}/repos/${repository}/releases/assets/${asset.id}`, 'application/octet-stream', sleep)
  if (!response.ok) throw new ReleaseAssetError(response.status, `Cannot download ${repository} asset ${name}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

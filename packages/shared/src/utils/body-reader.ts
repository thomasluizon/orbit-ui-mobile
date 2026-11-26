export interface BodyReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
  releaseLock(): void
  cancel?(reason?: unknown): Promise<void>
}

export interface BodySource {
  getReader(): BodyReader
}

const EMPTY_BODY_READER: BodyReader = {
  read: () => Promise.resolve({ done: true }),
  releaseLock: () => {},
  cancel: () => Promise.resolve(),
}

/** A response body is null for 204, HEAD and opaque responses, and undefined in some runtimes. A missing body reads as an empty stream. */
export function getBodyReader(body: BodySource | null | undefined): BodyReader {
  return body ? body.getReader() : EMPTY_BODY_READER
}

/** Yields each chunk of a response body, and yields none for a missing body. */
export async function* readBodyChunks(body: BodySource | null | undefined): AsyncGenerator<Uint8Array> {
  const reader = getBodyReader(body)
  try {
    let result = await reader.read()
    while (!result.done) {
      if (result.value) yield result.value
      result = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }
}

export class File extends Blob {
  readonly uri: string

  constructor(...segments: ({ uri: string } | string)[]) {
    super(['mock-file-content'])
    this.uri = segments
      .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
      .join('/')
  }

  get name() {
    return this.uri.split('/').pop() ?? 'file'
  }

  create() {}

  write() {}

  copy(destination: File | Directory, options?: { overwrite?: boolean }) {
    const destinationUri = destination instanceof Directory
      ? `${destination.uri}/${this.name}`
      : destination.uri
    expoFileSystemMock.copyCalls.push({
      sourceUri: this.uri,
      destinationUri,
      options,
    })
    if (expoFileSystemMock.nextCopyError) {
      const error = expoFileSystemMock.nextCopyError
      expoFileSystemMock.nextCopyError = null
      return Promise.reject(error)
    }
    if (expoFileSystemMock.existingFiles.has(destinationUri) && options?.overwrite !== true) {
      return Promise.reject(codedError('ERR_DESTINATION_ALREADY_EXISTS', 'Destination already exists'))
    }
    expoFileSystemMock.existingFiles.add(destinationUri)
    return Promise.resolve()
  }
}

export class Directory {
  readonly uri: string

  constructor(...segments: ({ uri: string } | string)[]) {
    this.uri = segments
      .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
      .join('/')
  }

  static pickDirectoryAsync() {
    if (expoFileSystemMock.nextDirectoryError) {
      const error = expoFileSystemMock.nextDirectoryError
      expoFileSystemMock.nextDirectoryError = null
      return Promise.reject(error)
    }
    return Promise.resolve(new Directory('content://downloads'))
  }
}

interface CopyCall {
  sourceUri: string
  destinationUri: string
  options?: { overwrite?: boolean }
}

function codedError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

export const expoFileSystemMock = {
  copyCalls: [] as CopyCall[],
  existingFiles: new Set<string>(),
  nextCopyError: null as Error | null,
  nextDirectoryError: null as Error | null,
  cancelNextDirectoryPick() {
    this.nextDirectoryError = codedError(
      'ERR_PICKER_CANCELLED',
      'The file picker was cancelled by the user',
    )
  },
  failNextCopy(error: Error) {
    this.nextCopyError = error
  },
  reset() {
    this.copyCalls = []
    this.existingFiles.clear()
    this.nextCopyError = null
    this.nextDirectoryError = null
  },
}

export const Paths = {
  cache: { uri: 'file:///cache' },
  document: { uri: 'file:///document' },
}

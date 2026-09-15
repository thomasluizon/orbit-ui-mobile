export class File extends Blob {
  readonly uri: string

  constructor(...segments: ({ uri: string } | string)[]) {
    super(['mock-file-content'])
    const segmentUris = segments.map((segment) => (typeof segment === 'string' ? segment : segment.uri))
    if (segmentUris.length > 1 && segmentUris[0]?.startsWith('content://')) {
      throw codedError(
        'ERR_SAF_PATH_JOIN',
        'SAF children must be created through Directory.createFile',
      )
    }
    this.uri = segments
      .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
      .join('/')
  }

  get name() {
    return expoFileSystemMock.fileNames.get(this.uri) ?? this.uri.split('/').pop() ?? 'file'
  }

  create() {}

  write() {}

  copy(destination: File | Directory, options?: { overwrite?: boolean }) {
    if (expoFileSystemMock.nextCopyError) {
      const error = expoFileSystemMock.nextCopyError
      expoFileSystemMock.nextCopyError = null
      return Promise.reject(error)
    }

    if (destination instanceof Directory && destination.uri.startsWith('content://')) {
      const directoryFiles = expoFileSystemMock.directoryFiles.get(destination.uri)
        ?? new Map<string, string>()
      const existingUri = directoryFiles.get(this.name)
      if (existingUri && options?.overwrite !== true) {
        return Promise.reject(codedError('ERR_DESTINATION_ALREADY_EXISTS', 'Destination already exists'))
      }
      if (existingUri) {
        deleteSafDocument(existingUri)
      }
      const resultingUri = createSafDocument(destination.uri, this.name)
      expoFileSystemMock.copyCalls.push({
        sourceUri: this.uri,
        destinationUri: destination.uri,
        destinationKind: 'directory',
        resultingUri,
        options,
      })
      return Promise.resolve()
    }

    const destinationUri = destination.uri
    expoFileSystemMock.copyCalls.push({
      sourceUri: this.uri,
      destinationUri,
      destinationKind: destination instanceof Directory ? 'directory' : 'file',
      resultingUri: destinationUri,
      options,
    })
    if (expoFileSystemMock.existingFiles.has(destinationUri) && options?.overwrite !== true) {
      return Promise.reject(codedError('ERR_DESTINATION_ALREADY_EXISTS', 'Destination already exists'))
    }
    if (destination instanceof File
      && destinationUri.startsWith('content://')
      && expoFileSystemMock.existingFiles.has(destinationUri)
    ) {
      deleteSafDocument(destinationUri)
      return Promise.reject(codedError(
        'ERR_SAF_DESTINATION_DELETED',
        'Expo deleted the SAF destination document before opening its sink',
      ))
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

  list() {
    return [...(expoFileSystemMock.directoryFiles.get(this.uri)?.values() ?? [])]
      .map((uri) => new File(uri))
  }

  createFile(name: string, mimeType: string | null) {
    const uri = createSafDocument(this.uri, name)
    expoFileSystemMock.createFileCalls.push({ directoryUri: this.uri, name, mimeType, uri })
    return new File(uri)
  }
}

interface CopyCall {
  sourceUri: string
  destinationUri: string
  destinationKind: 'directory' | 'file'
  resultingUri: string
  options?: { overwrite?: boolean }
}

interface CreateFileCall {
  directoryUri: string
  name: string
  mimeType: string | null
  uri: string
}

function codedError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

function createSafDocument(directoryUri: string, name: string) {
  const uri = `content://mock-document/${expoFileSystemMock.nextDocumentId}`
  expoFileSystemMock.nextDocumentId += 1
  const directoryFiles = expoFileSystemMock.directoryFiles.get(directoryUri) ?? new Map<string, string>()
  directoryFiles.set(name, uri)
  expoFileSystemMock.directoryFiles.set(directoryUri, directoryFiles)
  expoFileSystemMock.fileNames.set(uri, name)
  expoFileSystemMock.existingFiles.add(uri)
  return uri
}

function deleteSafDocument(uri: string) {
  expoFileSystemMock.existingFiles.delete(uri)
  expoFileSystemMock.fileNames.delete(uri)
  for (const directoryFiles of expoFileSystemMock.directoryFiles.values()) {
    for (const [name, childUri] of directoryFiles) {
      if (childUri === uri) {
        directoryFiles.delete(name)
      }
    }
  }
}

export const expoFileSystemMock = {
  copyCalls: [] as CopyCall[],
  createFileCalls: [] as CreateFileCall[],
  directoryFiles: new Map<string, Map<string, string>>(),
  existingFiles: new Set<string>(),
  fileNames: new Map<string, string>(),
  nextDocumentId: 1,
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
    this.createFileCalls = []
    this.directoryFiles.clear()
    this.existingFiles.clear()
    this.fileNames.clear()
    this.nextDocumentId = 1
    this.nextCopyError = null
    this.nextDirectoryError = null
  },
}

export const Paths = {
  cache: { uri: 'file:///cache' },
  document: { uri: 'file:///document' },
}

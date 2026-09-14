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

  async copy(_destination: File | Directory) {}
}

export class Directory {
  readonly uri: string

  constructor(...segments: ({ uri: string } | string)[]) {
    this.uri = segments
      .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
      .join('/')
  }

  static pickDirectoryAsync() {
    return Promise.resolve(new Directory('content://downloads'))
  }
}

export const Paths = {
  cache: { uri: 'file:///cache' },
  document: { uri: 'file:///document' },
}

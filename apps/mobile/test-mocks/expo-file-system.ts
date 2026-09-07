export class File extends Blob {
  readonly uri: string

  constructor(...segments: Array<{ uri: string } | string>) {
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
}

export const Paths = {
  cache: { uri: 'file:///cache' },
  document: { uri: 'file:///document' },
}

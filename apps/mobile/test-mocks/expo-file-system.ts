export class File {
  readonly uri: string

  size = 1024

  constructor(...segments: Array<{ uri: string } | string>) {
    this.uri = segments
      .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
      .join('/')
  }

  create() {}

  write() {}

  async text() {
    return 'mock-file-content'
  }
}

export const Paths = {
  cache: { uri: 'file:///cache' },
  document: { uri: 'file:///document' },
}

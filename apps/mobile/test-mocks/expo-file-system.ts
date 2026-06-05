export class File {
  readonly uri: string

  constructor(...segments: Array<{ uri: string } | string>) {
    this.uri = segments
      .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
      .join('/')
  }

  create() {}

  write() {}
}

export const Paths = {
  cache: { uri: 'file:///cache' },
  document: { uri: 'file:///document' },
}

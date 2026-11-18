declare module '*.png' {
  /** Metro resolves a bundled image and its density variants to one asset reference. */
  const asset: number
  export default asset
}

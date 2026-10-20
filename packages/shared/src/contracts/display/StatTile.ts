/**
 * never swaps a tile row out for a hand-built loading version. A tile with no data NEVER
 * renders a 0, which reads as a real measurement) · a tile has no hover, focus, active or
 * disabled state: it is not interactive, and a stat that can be opened is a row, not a tile.
 */
interface StatTileBase {
  label: string
}

export interface DefaultStatTileProps extends StatTileBase {
  state?: 'default'
  /** the figure */
  value: string | number
  emptyLabel?: never
  loadingLabel?: never
}

export interface LoadingStatTileProps extends StatTileBase {
  state: 'loading'
  /** REQUIRED: the accessible name while loading, in the screen's locale (e.g. "Carregando" / "Loading") */
  loadingLabel: string
  value?: never
  emptyLabel?: never
}

export interface EmptyStatTileProps extends StatTileBase {
  state: 'empty'
  /** REQUIRED: what the empty value slot says, in the screen's locale (e.g. "sem dados" / "no data") -
   * never "0", which reads as a real measurement */
  emptyLabel: string
  value?: never
  loadingLabel?: never
}

/** Discriminated on `state`: each state requires exactly its own words. */
export type StatTileProps =
  | DefaultStatTileProps
  | LoadingStatTileProps
  | EmptyStatTileProps

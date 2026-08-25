/** Stat tile: Space Grotesk tabular numeral over a quiet label. Ships its full state set, so a screen
 *  never swaps a tile row out for a hand-built loading version.
 *  States: default · loading (a skeleton SHAPED LIKE THE TILE that holds its exact dimensions - same
 *  padding, a 24px value block and a label-height bar - so nothing reflows when the figure arrives; never
 *  a spinner) · empty (the figure has no data yet: the value slot says so in mono --fg-4 and the label
 *  dims one step. A tile with no data NEVER renders a 0, which reads as a real measurement) · a tile has
 *  no hover, focus, active or disabled state: it is not interactive, and a stat that can be opened is a
 *  row, not a tile. Error is the block's, not the tile's.
 *  THE WORDS ARE THE CALLER'S, per state and per locale, discriminated in the type: a loading tile cannot
 *  render without its `loadingLabel`, an empty tile cannot render without its `emptyLabel`, and neither word
 *  can be passed where it cannot show. No default exists in either language. */
interface StatTileBase {
  label: string;
}
export interface DefaultStatTileProps extends StatTileBase {
  state?: 'default';
  /** the figure */
  value: string | number;
  emptyLabel?: never;
  loadingLabel?: never;
}
export interface LoadingStatTileProps extends StatTileBase {
  state: 'loading';
  /** REQUIRED: the accessible name while loading, in the screen's locale (e.g. "Carregando" / "Loading") */
  loadingLabel: string;
  value?: never;
  emptyLabel?: never;
}
export interface EmptyStatTileProps extends StatTileBase {
  state: 'empty';
  /** REQUIRED: what the empty value slot says, in the screen's locale (e.g. "sem dados" / "no data") -
   *  never "0", which reads as a real measurement */
  emptyLabel: string;
  value?: never;
  loadingLabel?: never;
}
/** Discriminated on `state`: each state requires exactly its own words. */
export type StatTileProps = DefaultStatTileProps | LoadingStatTileProps | EmptyStatTileProps;
export declare function StatTile(props: StatTileProps): any;

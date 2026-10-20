/** Tabler icon (the only sanctioned icon set). Sizes 16/20/24, default 24. Outline is default; filled marks the active state.
 * The glyph is a SELF-CENTRING SQUARE: inline-flex, size x size, both axes centred, line-height 1. A consumer never needs to size, centre or line-height it - and never sets display on it. */
export interface IconProps {
  /** Tabler icon name, e.g. "home", "target", "snowflake" */
  name: string;
  size?: 16 | 20 | 24;
  /** filled variant = active state, never decoration */
  filled?: boolean;
  color?: string;
  /** accessible label; omit for decorative icons */
  label?: string;
  style?: any;
}
export declare function Icon(props: IconProps): any;

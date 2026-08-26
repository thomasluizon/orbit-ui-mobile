/** Pill button. The primary fill is one of the four accent roles: exactly one filled action per view.
 *
 *  AN ICON-ONLY BUTTON CANNOT RENDER WITHOUT ITS NAME, discriminated in the type the same way Fab's
 *  `label` and NavHeader's `backLabel` are. A control whose only child is a glyph has no text node to
 *  name it, so `iconOnly` pairs with a REQUIRED `label` and neither can be passed without the other.
 *  A button with a visible text label is named by that text and takes no `label`, so the two cannot be
 *  given at once and a screen reader never hears the name twice.
 *
 *  The word is the CALLER's, in the screen's locale. No default exists in either language.
 *
 *  There is no `style` prop, deliberately: the variants and sizes below are the whole surface, and a
 *  style passthrough on a design-system primitive is how token discipline leaks. A surface that needs
 *  a treatment these variants cannot express is a request against the design system, not a caller-side
 *  override. */
interface ButtonBase {
  /** primary carries the accent fill; ghost is hairline; secondary is the neutral fill; destructive and caution carry status hues */
  variant?: 'primary' | 'ghost' | 'secondary' | 'destructive' | 'caution';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
/** The ordinary button: its visible text is its accessible name. */
export interface LabelledButtonProps extends ButtonBase {
  /** the visible label, which names the control */
  children: string;
  iconOnly?: never;
  label?: never;
}
/** Icon-only: a glyph and nothing readable, so the name is required and comes from the caller. */
export interface IconOnlyButtonProps extends ButtonBase {
  /** the glyph */
  children: any;
  iconOnly: true;
  /** REQUIRED: the accessible name, e.g. "Voltar" / "Back". No default in either language. */
  label: string;
}
/** Discriminated on `iconOnly`: a nameless icon-only button does not compile. */
export type ButtonProps = LabelledButtonProps | IconOnlyButtonProps;
export declare function Button(props: ButtonProps): any;

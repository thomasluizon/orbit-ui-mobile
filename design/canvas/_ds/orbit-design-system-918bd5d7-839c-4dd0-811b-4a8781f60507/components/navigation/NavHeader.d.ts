/** 56px screen header: mono uppercase title, 44px round back button.
 *  The back control's name is the CALLER's, in the screen's locale - paired in the type with `onBack`, so a
 *  header with a back control cannot render without its words, and one without cannot be given them.
 *  No default exists in either language. */
interface NavHeaderBase { title: string; trailing?: any; }
export interface NavHeaderBackProps extends NavHeaderBase {
  onBack: () => void;
  /** REQUIRED with onBack, e.g. "Voltar" / "Back" */
  backLabel: string;
}
export interface NavHeaderPlainProps extends NavHeaderBase {
  onBack?: never;
  backLabel?: never;
}
export type NavHeaderProps = NavHeaderBackProps | NavHeaderPlainProps;
export declare function NavHeader(props: NavHeaderProps): any;

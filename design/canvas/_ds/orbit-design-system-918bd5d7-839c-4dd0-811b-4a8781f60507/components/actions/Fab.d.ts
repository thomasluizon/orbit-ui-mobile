/** Floating action button: the next-action accent role. One per view, usually above the TabBar. */
export interface FabProps {
  /** accessible label, e.g. "Criar hábito" */
  label: string;
  children?: any;
  onClick?: () => void;
}
export declare function Fab(props: FabProps): any;

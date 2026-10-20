/** Toggle switch; the ON track carries the accent (a current-position role). Label describes the ON state. */
export interface SwitchProps {
  /** label for the ON state, e.g. "Enviar lembretes"; rendered as a row with the switch trailing */
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}
export declare function Switch(props: SwitchProps): any;

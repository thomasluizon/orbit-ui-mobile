/** Settings list: 52px rows, label + mono value. The group owns the rule between rows, never after the last. */
export interface SettingsGroupProps {
  items: Array<{ label: string; value?: string; trailing?: any; onClick?: () => void }>;
}
export declare function SettingsGroup(props: SettingsGroupProps): any;

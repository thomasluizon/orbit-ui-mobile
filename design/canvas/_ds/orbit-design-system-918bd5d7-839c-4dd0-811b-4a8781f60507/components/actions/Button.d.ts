/** Pill button. The primary fill is one of the four accent roles: exactly one filled action per view. */
export interface ButtonProps {
  /** primary carries the accent fill; ghost is hairline; secondary is the neutral fill; destructive and caution carry status hues */
  variant?: 'primary' | 'ghost' | 'secondary' | 'destructive' | 'caution';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  children?: any;
  onClick?: () => void;
}
export declare function Button(props: ButtonProps): any;

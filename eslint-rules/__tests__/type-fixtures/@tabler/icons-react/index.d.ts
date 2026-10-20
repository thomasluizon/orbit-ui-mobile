export interface IconProps {
  size?: string | number
  stroke?: string | number
  title?: string
}

export type Icon = (props: IconProps) => unknown

export declare const IconCheck: Icon
export declare const IconTrash: Icon
export declare const IconReceipt: Icon

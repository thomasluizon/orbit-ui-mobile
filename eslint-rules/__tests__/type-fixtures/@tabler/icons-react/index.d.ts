/**
 * A hermetic stand-in for the real `@tabler/icons-react` declarations.
 *
 * `local/icon-size-grid` identifies an icon by where its PROPS type is declared, so the only
 * thing a fixture has to reproduce is that: an `IconProps` interface declared under a path
 * containing `@tabler/icons-react`, and components whose first parameter is that interface.
 * Testing against the installed package instead would tie the rule's tests to a dependency
 * version, and the real declaration file is 51000 lines.
 */

export interface IconProps {
  size?: string | number
  stroke?: string | number
  title?: string
}

export type Icon = (props: IconProps) => unknown

export declare const IconCheck: Icon
export declare const IconTrash: Icon
export declare const IconReceipt: Icon

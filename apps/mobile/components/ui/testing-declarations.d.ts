declare module 'react-test-renderer' {
  import type { ElementType, ReactElement } from 'react'

  export interface ReactTestRendererJSON {
    type: string
    props: Record<string, unknown>
    children: (ReactTestRendererJSON | string)[] | string | null
  }

  export interface ReactTestInstance {
    type: ElementType
    props: Record<string, unknown>
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[]
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance
    update: (element: ReactElement) => void
  }

  export function create(element: ReactElement): ReactTestRenderer
  export function act(callback: () => void | Promise<void>): void | Promise<void>
}

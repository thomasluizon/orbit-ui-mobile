declare module 'react-test-renderer' {
  export interface ReactTestRendererJSON {
    type: string
    props: Record<string, unknown>
    children: Array<ReactTestRendererJSON | string> | string | null
  }
}

declare module '@testing-library/react-native' {
  import type { ReactElement } from 'react'

  export type RenderResult = {
    toJSON: () => unknown
  } & Record<string, unknown>

  export const fireEvent: {
    press: (element: unknown) => void
  }

  export function render(element: ReactElement): RenderResult

  export const screen: {
    getByLabelText: (text: string) => unknown
    getByText: (text: string) => unknown
  }
}

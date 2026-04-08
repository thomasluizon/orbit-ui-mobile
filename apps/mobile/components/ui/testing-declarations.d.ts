declare module 'react-test-renderer' {
  import type { ReactElement } from 'react'

  export interface ReactTestRendererJSON {
    type: string
    props: Record<string, unknown>
    children: Array<ReactTestRendererJSON | string> | string | null
  }

  export interface ReactTestRenderer {
    update: (element: ReactElement) => void
  }

  export function create(element: ReactElement): ReactTestRenderer
  export function act(callback: () => void | Promise<void>): void | Promise<void>
}

declare module '@testing-library/react-native' {
  import type { ReactElement } from 'react'

  type TestingLibraryMethod = (...args: readonly unknown[]) => unknown

  export type RenderResult = {
    toJSON: () => unknown
  } & Record<string, unknown>

  export const fireEvent: {
    press: (element: unknown) => void
    changeText: (element: unknown, text: string) => void
    [key: string]: (...args: readonly unknown[]) => void
  }

  export function render(element: ReactElement): RenderResult

  export const screen: {
    getByLabelText: (text: string) => unknown
    getByText: (text: string) => unknown
    getAllByText: (text: string) => unknown[]
    getByPlaceholderText: (text: string) => unknown
    getByDisplayValue: (text: string) => unknown
    getByTestId: (text: string) => unknown
    queryByText: (text: string) => unknown | null
    queryByLabelText: (text: string) => unknown | null
    queryByPlaceholderText: (text: string) => unknown | null
    queryByDisplayValue: (text: string) => unknown | null
    queryByTestId: (text: string) => unknown | null
    [key: string]: TestingLibraryMethod
  }
}

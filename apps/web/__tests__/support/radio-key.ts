import { act, fireEvent } from '@testing-library/react'

export async function pressRadioKey(control: Element, key: string) {
  await act(async () => {
    fireEvent.keyDown(control, { key })
    await new Promise<void>((resolveFocus) => setTimeout(resolveFocus, 0))
    fireEvent.keyUp(control, { key })
  })
}

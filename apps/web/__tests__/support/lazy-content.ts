import { act } from '@testing-library/react'
import { vi } from 'vitest'

export async function waitForLazyContent(ready?: Promise<unknown>) {
  await act(async () => {
    await ready
    await vi.dynamicImportSettled()
  })
}

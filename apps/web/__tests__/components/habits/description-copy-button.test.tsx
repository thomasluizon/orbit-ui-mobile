import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DescriptionCopyButton } from '@/components/habits/description-copy-button'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
const copyButton = () => screen.getByRole('button', { name: 'habits.detail.copyDescription' })

describe('description copy action', () => {
  it('copies the complete original text and announces success', async () => {
    const description = '  **Original**\n\n' + 'A complete note. '.repeat(100)
    render(<DescriptionCopyButton description={description} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await act(async () => { fireEvent.click(copyButton()) })
    expect(writeText).toHaveBeenCalledWith(description)
    expect(screen.getByRole('status')).toHaveTextContent('habits.detail.descriptionCopied')
  })

  it.each(['rejection', 'missing', 'throw'])('shows a persistent failure for %s without claiming success, then allows retry', async (failure) => {
    if (failure === 'missing') Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    else if (failure === 'throw') writeText.mockImplementation(() => { throw new Error('denied') })
    else writeText.mockRejectedValue(new Error('denied'))
    render(<DescriptionCopyButton description="A note" />)
    await act(async () => { fireEvent.click(copyButton()) })
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('habits.detail.copyFailed')
    expect(copyButton()).toHaveAttribute('aria-describedby', error.id)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => { fireEvent.click(copyButton()) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('habits.detail.descriptionCopied')
  })

  it('disables empty descriptions', () => {
    render(<DescriptionCopyButton description={" \n "} />)
    expect(copyButton()).toBeDisabled()
    fireEvent.click(copyButton())
    expect(writeText).not.toHaveBeenCalled()
  })

  it('disables repeat activation until the clipboard write finishes', async () => {
    let finish!: () => void
    writeText.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    render(<DescriptionCopyButton description="A note" />)
    fireEvent.click(copyButton())
    expect(copyButton()).toBeDisabled()
    expect(copyButton()).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(copyButton())
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await act(async () => { finish() })
    expect(copyButton()).toBeEnabled()
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { DescriptionCopyButton } from '@/components/habits/description-copy-button'
import { advanceAccountGeneration } from '@/lib/session-epoch'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
const writeText = vi.fn()

beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  const stylesheet = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
  const style = document.createElement('style')
  stylesheet.root.walkRules('.sr-only', (rule) => { style.textContent += rule.toString() })
  document.head.append(style)
})

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
    expect(screen.getAllByRole('status')).toHaveLength(1)
    const feedback = getComputedStyle(screen.getByRole('status'))
    expect(feedback.position).toBe('absolute')
    expect(feedback.width).toBe('1px')
    expect(feedback.height).toBe('1px')
    expect(feedback.overflow).toBe('hidden')
    expect(feedback.clipPath).toBe('inset(50%)')
    expect(feedback.whiteSpace).toBe('nowrap')
    expect(copyButton().querySelectorAll('svg')).toHaveLength(1)
    expect(copyButton().querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(['rejection', 'missing', 'throw'])('shows a persistent failure for %s without claiming success, then allows retry', async (failure) => {
    if (failure === 'missing') Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    else if (failure === 'throw') writeText.mockImplementation(() => { throw new Error('denied') })
    else writeText.mockRejectedValue(new Error('denied'))
    render(<DescriptionCopyButton description="A note" />)
    await act(async () => { fireEvent.click(copyButton()) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const error = screen.getByRole('status')
    expect(error).toHaveTextContent('habits.detail.copyFailed')
    expect(getComputedStyle(error).position).not.toBe('absolute')
    expect(copyButton()).toHaveAttribute('aria-describedby', error.id)
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

  it.each(['description', 'account'])('clears completed and late copy status when the %s changes', async (change) => {
    const { rerender } = render(<DescriptionCopyButton description="Original" />)
    await act(async () => { fireEvent.click(copyButton()) })
    expect(screen.getByRole('status')).toHaveTextContent('habits.detail.descriptionCopied')
    if (change === 'description') rerender(<DescriptionCopyButton description="Replacement" />)
    else act(() => { advanceAccountGeneration() })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    let finish!: () => void
    writeText.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    fireEvent.click(copyButton())
    if (change === 'description') rerender(<DescriptionCopyButton description="Third" />)
    else act(() => { advanceAccountGeneration() })
    await act(async () => { finish() })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(copyButton()).toBeEnabled()
  })

  it('empties the same single announcement channel before each repeated copy', async () => {
    render(<DescriptionCopyButton description="A note" />)
    const region = screen.getByRole('status')
    await act(async () => { fireEvent.click(copyButton()) })
    let finish!: () => void
    writeText.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    fireEvent.click(copyButton())
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toBeEmptyDOMElement()
    await act(async () => { finish() })
    expect(screen.getAllByRole('status')).toEqual([region])
    expect(region).toHaveTextContent('habits.detail.descriptionCopied')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    open,
    title,
    children,
    onOpenChange,
  }: {
    open: boolean
    title?: string
    children?: ReactNode
    onOpenChange?: (next: boolean) => void
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          close-overlay
        </button>
        {children}
      </div>
    ) : null,
}))

import { DescriptionViewer } from '@/components/habits/description-viewer'

const writeText = vi.fn()

describe('DescriptionViewer', () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <DescriptionViewer
        open={false}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Test desc"
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title and description when open', () => {
    render(
      <DescriptionViewer
        open={true}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Some description"
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('My Habit')).toBeInTheDocument()
    expect(screen.getByText('Some description')).toBeInTheDocument()
  })

  it('keeps pathological prose complete while preserving scrollable blocks', () => {
    const reportedList = '#16,#17,#18,#19,#21,#23,#25,#28,#30,#32,#39,#48,#49,#62,#64,#82'
    const longToken = 'x'.repeat(400)
    const longUrl = `https://orbit.app/reference/${'u'.repeat(270)}`
    const base64Blob = 'Q'.repeat(240)
    const table = [
      '| one | two | three | four | five | six | seven | eight |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      '| a | b | c | d | e | f | g | h |',
    ].join('\n')
    const description = [
      reportedList,
      longToken,
      `<${longUrl}>`,
      `\`${base64Blob}\``,
      `\`\`\`sh\n${base64Blob}\n\`\`\``,
      table,
      'Ordinary short prose still reads normally.',
    ].join('\n\n')

    const { container } = render(
      <DescriptionViewer
        open
        onOpenChange={vi.fn()}
        title="Pathological description"
        description={description}
      />,
    )

    const prose = container.querySelector('.prose-orbit')
    expect(prose?.textContent).toContain(reportedList)
    expect(prose?.textContent).toContain(longToken)
    expect(prose?.textContent).toContain(longUrl)
    expect(prose?.textContent).toContain('Ordinary short prose still reads normally.')

    const link = screen.getByRole('link', { name: longUrl })
    expect(link).toHaveAttribute('href', longUrl)

    const codeElements = Array.from(container.querySelectorAll('code'))
    expect(codeElements.some((code) => code.closest('pre') === null && code.textContent === base64Blob)).toBe(true)
    const codeBlock = container.querySelector('pre')
    expect(codeBlock).toHaveAttribute('tabindex', '0')
    expect(codeBlock?.textContent).toContain(base64Blob)

    const markdownTable = container.querySelector('table')
    expect(markdownTable).toHaveAttribute('tabindex', '0')
    expect(markdownTable?.textContent).toContain('eight')

    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    const proseDeclaration = css.match(/\.prose-orbit\s*\{[^}]+\}/)?.[0]
    expect(proseDeclaration).toContain('max-width: 65ch')
    expect(proseDeclaration).toContain('overflow-wrap: anywhere')
    expect(css).toMatch(/\.prose-orbit a\s*\{[^}]*overflow-wrap: anywhere/s)
    expect(css).toMatch(/\.prose-orbit pre\s*\{[^}]*overflow-x: auto[^}]*overflow-wrap: normal/s)
    expect(css).toMatch(/\.prose-orbit table\s*\{[^}]*overflow-x: auto[^}]*overflow-wrap: normal/s)
  })

  it('copies the description when the copy button is clicked', async () => {
    render(
      <DescriptionViewer
        open={true}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Copy me"
      />,
    )
    fireEvent.click(screen.getByLabelText('habits.detail.copyDescription'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Copy me'))
  })

  it('shows a persistent error next to the copy button when clipboard access is denied', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(
      <DescriptionViewer
        open={true}
        onOpenChange={vi.fn()}
        title="My Habit"
        description="Copy me"
      />,
    )
    fireEvent.click(screen.getByLabelText('habits.detail.copyDescription'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('habits.detail.copyFailed')
    })
    expect(screen.getByLabelText('habits.detail.copyDescription')).toBeInTheDocument()
  })

  it('clears the copy failure when the viewer closes, so reopening starts clean', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <DescriptionViewer
        open={true}
        onOpenChange={onOpenChange}
        title="My Habit"
        description="Copy me"
      />,
    )
    fireEvent.click(screen.getByLabelText('habits.detail.copyDescription'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    fireEvent.click(screen.getByText('close-overlay'))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(
      <DescriptionViewer
        open={false}
        onOpenChange={onOpenChange}
        title="My Habit"
        description="Copy me"
      />,
    )
    rerender(
      <DescriptionViewer
        open={true}
        onOpenChange={onOpenChange}
        title="My Habit"
        description="Copy me"
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

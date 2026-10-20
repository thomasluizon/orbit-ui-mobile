import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ListRow } from '@/components/ui/list-row'
import { RadioRow } from '@/components/ui/select-check'
import { RowList } from '@/components/ui/row-list'
import { SettingsGroup } from '@/components/ui/settings-group'

describe('list primitives on web', () => {
  it('insets invoice actions and navigation controls without shrinking their touch targets', () => {
    const onDownload = vi.fn()
    const { container, rerender } = render(
      <ListRow title="Invoice" description="September subscription" chevron={false}
        action={{ icon: 'download', label: 'Download invoice', onPress: onDownload }} />,
    )
    const action = screen.getByRole('button', { name: 'Download invoice' })
    const row = action.parentElement
    expect(row).toBe(container.firstElementChild)
    expect(row?.style.padding).toBe('')
    expect(action).toHaveStyle({ marginBlock: '8px', marginInlineEnd: '16px', marginInlineStart: '0px', alignSelf: 'center' })
    expect(action).toHaveClass('size-[var(--touch-min)]', 'rounded-full')
    expect(action.firstElementChild).toHaveStyle({ width: '48px', height: '48px' })
    action.focus()
    expect(action).toHaveFocus()
    fireEvent.pointerEnter(action)
    fireEvent.pointerDown(action)
    expect(action).toHaveStyle({ marginBlock: '8px', marginInlineEnd: '16px', marginInlineStart: '0px', alignSelf: 'center' })
    fireEvent.pointerUp(action)
    fireEvent.pointerLeave(action)
    fireEvent.click(action)
    expect(onDownload).toHaveBeenCalledOnce()

    rerender(<ListRow title="Account" onClick={vi.fn()} />)
    const navigation = screen.getByRole('button', { name: 'Account' })
    expect(navigation.parentElement?.style.padding).toBe('')
    expect(navigation).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingBlock: '12px', paddingInline: '16px' })
    expect(navigation.firstElementChild).toHaveStyle({ minHeight: '24px', gap: '12px' })
    expect(navigation.firstElementChild?.lastElementChild).toHaveStyle({ width: '24px', minHeight: '24px' })

    rerender(<ListRow title="Read only" readOnly />)
    expect(container.firstElementChild?.firstElementChild).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingBlock: '12px', paddingInline: '16px' })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('places a row on a padded column edge and preserves card padding', () => {
    const view = render(<ListRow title="Tags" placement="column" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingBlock: '12px', position: 'relative' })
    expect(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')).toContain('--row-h-compact: 52px;')
    view.rerender(<ListRow title="Tags" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingBlock: '12px', paddingInline: '16px' })
  })

  it('owns the entire padded perimeter in adjacent body and action targets', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    const { container } = render(
      <ListRow title="Template" onClick={onOpen} chevron={false}
        action={{ icon: 'trash', label: 'Remove template', onPress: onRemove }} />,
    )
    const body = screen.getByRole('button', { name: 'Template' })
    const action = screen.getByRole('button', { name: 'Remove template' })
    const row = container.firstElementChild
    expect(Array.from(row?.children ?? [])).toEqual([body, action])
    expect(row).toHaveStyle({ minHeight: '52px' })
    expect(body.parentElement?.style.padding).toBe('')
    expect(body).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingBlock: '12px', paddingInline: '16px' })
    expect(action).toHaveStyle({ marginBlock: '4px', marginInlineEnd: '16px', marginInlineStart: '0px', alignSelf: 'center' })
    fireEvent.click(body)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onRemove).not.toHaveBeenCalled()
    fireEvent.click(action)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('keeps ListRow body and trailing actions independent', () => {
    const onClick = vi.fn()
    const onAction = vi.fn()
    const { container, rerender } = render(
      <ListRow
        icon="home"
        title="Account"
        description="Profile and security"
        value="Ready"
        trailing={<span>Synced</span>}
        onClick={onClick}
        action={{ icon: 'trash', label: 'Remove account', onPress: onAction, danger: true }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Account/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove account' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledOnce()
    expect(screen.getByText('Profile and security')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Synced')).toBeInTheDocument()
    expect(screen.getByText('Synced').closest('button')).toBe(
      screen.getByRole('button', { name: /Account/ }),
    )
    expect(container.querySelector('[data-icon="home"]')).toBeInTheDocument()

    rerender(
      <ListRow
        title="Danger zone"
        danger
        chevron={false}
        action={{ icon: 'trash', label: 'Archive', onPress: vi.fn() }}
      />,
    )
    expect(screen.queryByText('Profile and security')).toBeNull()
    expect(screen.getByText('Danger zone')).toHaveStyle({ color: 'var(--status-bad-text)' })

    rerender(<ListRow title="Read only" readOnly />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders RadioRow selection details and disables unavailable choices', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<RadioRow label="Daily" onSelect={onSelect} />)
    const choice = screen.getByRole('radio', { name: 'Daily' })
    expect(choice).toHaveAttribute('aria-checked', 'false')
    expect(choice).toHaveStyle({ paddingInlineStart: '16px' })
    fireEvent.click(choice)
    expect(onSelect).toHaveBeenCalledOnce()

    rerender(
      <RadioRow
        label="Weekly"
        description="Every Monday"
        selected
        onSelect={onSelect}
        leading={<span>W</span>}
        depth={2}
        meta="3/4"
        tag="Pro"
      />,
    )
    expect(screen.getByRole('radio', { name: /Weekly/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Weekly/ })).toHaveStyle({ paddingInlineStart: '32px' })
    expect(screen.getByText('Every Monday')).toBeInTheDocument()
    expect(screen.getByText('3/4')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()

    rerender(
      <RadioRow label="Locked" selected disabled reason="Upgrade required" depth={-2} />,
    )
    const disabled = screen.getByRole('radio', { name: /Locked/ })
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    expect(disabled).toHaveStyle({ paddingInlineStart: '16px' })
    expect(screen.getByText('Upgrade required')).toBeInTheDocument()
    for (const [depth, padding] of [[1, '24px'], [3, '48px'], [4, '64px'], [5, '96px']] as const) {
      rerender(<RadioRow label="Nested" depth={depth} />)
      expect(screen.getByRole('radio', { name: 'Nested' })).toHaveStyle({ paddingInlineStart: padding })
    }
  })

  it('filters non-row children and divides valid RowList entries', () => {
    const { container } = render(
      <RowList style={{ borderRadius: 8 }}>
        ignored
        <span>First</span>
        {null}
        <span>Second</span>
      </RowList>,
    )
    const panel = container.firstElementChild
    expect(panel).toHaveStyle({ borderRadius: '8px' })
    expect(panel?.children).toHaveLength(2)
    expect(panel?.children[0]?.getAttribute('style')).toBeNull()
    expect(panel?.children[1]?.getAttribute('style')).toContain(
      'border-top: 1px solid var(--hairline)',
    )
  })

  it('renders static and actionable SettingsGroup entries with optional content', () => {
    const openProfile = vi.fn()
    const openPrivacy = vi.fn()
    render(
      <SettingsGroup>{[
          { label: 'Version' },
          { label: 'Profile', value: 'Alex', trailing: <span>Verified</span>, onClick: openProfile },
          { label: 'Plan', value: 'Pro' },
          { label: 'Privacy', onClick: openPrivacy },
        ].map((item: { label: string; value?: string; trailing?: React.ReactNode; onClick?: () => void }, index) => <ListRow key={index} title={item.label} value={item.value} trailing={item.trailing} readOnly={!item.onClick} onClick={item.onClick} />)}</SettingsGroup>,
    )

    expect(screen.getByText('Version').closest('button')).toBeNull()
    expect(screen.getByText('Plan').closest('button')).toBeNull()
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Profile/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }))
    expect(openProfile).toHaveBeenCalledOnce()
    expect(openPrivacy).toHaveBeenCalledOnce()
  })

  it('draws a divider above every actionable SettingsGroup entry except the first', () => {
    render(<SettingsGroup>{[{ label: 'Account', onClick: vi.fn() }, { label: 'Privacy', onClick: vi.fn() }].map((item: { label: string; value?: string; trailing?: React.ReactNode; onClick?: () => void }, index) => <ListRow key={index} title={item.label} value={item.value} trailing={item.trailing} readOnly={!item.onClick} onClick={item.onClick} />)}</SettingsGroup>)

    expect(screen.getByRole('button', { name: 'Account' }).getAttribute('style')).not.toContain('border-top')
    expect(screen.getByRole('button', { name: 'Privacy' }).closest('.orbit-list-row-shell')?.previousElementSibling).toHaveStyle({ height: '1px', background: 'var(--hairline)' })
  })
})

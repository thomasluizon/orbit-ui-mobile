import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListRow } from '@/components/ui/list-row'
import { RadioRow } from '@/components/ui/radio-row'
import { RowList } from '@/components/ui/row-list'
import { SettingsGroup } from '@/components/ui/settings-group-list'

describe('list primitives on web', () => {
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

    const bodyControl = screen.getByRole('button', { name: /Account/ })
    fireEvent.pointerEnter(bodyControl)
    expect(bodyControl).toHaveAttribute('data-interaction', 'hover')
    fireEvent.pointerDown(bodyControl)
    expect(bodyControl).toHaveAttribute('data-interaction', 'pressed')
    fireEvent.pointerUp(bodyControl)
    expect(bodyControl).toHaveAttribute('data-interaction', 'hover')
    fireEvent.pointerLeave(bodyControl)
    expect(bodyControl).toHaveAttribute('data-interaction', 'rest')
    fireEvent.click(bodyControl)
    fireEvent.click(screen.getByRole('button', { name: 'Remove account' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledOnce()
    expect(screen.getByText('Profile and security')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Synced')).toBeInTheDocument()
    expect(screen.getByText('Synced').closest('button')).toBe(
      bodyControl,
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
    expect(screen.getByText('Danger zone')).toHaveStyle({ color: 'var(--status-bad)' })

    rerender(<ListRow title="Read only" readOnly />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders RadioRow selection details and disables unavailable choices', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<RadioRow label="Daily" onSelect={onSelect} />)
    const choice = screen.getByRole('radio', { name: 'Daily' })
    expect(choice).toHaveAttribute('aria-checked', 'false')
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
    expect(screen.getByText('Every Monday')).toBeInTheDocument()
    expect(screen.getByText('3/4')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()

    rerender(
      <RadioRow label="Locked" selected disabled reason="Upgrade required" depth={-2} />,
    )
    const disabled = screen.getByRole('radio', { name: /Locked/ })
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Upgrade required')).toBeInTheDocument()
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
      <SettingsGroup
        items={[
          { label: 'Version' },
          { label: 'Profile', value: 'Thomas', trailing: <span>Verified</span>, onClick: openProfile },
          { label: 'Plan', value: 'Pro' },
          { label: 'Privacy', onClick: openPrivacy },
        ]}
      />,
    )

    expect(screen.getByText('Version').closest('button')).toBeNull()
    expect(screen.getByText('Plan').closest('button')).toBeNull()
    expect(screen.getByText('Thomas')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Profile/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }))
    expect(openProfile).toHaveBeenCalledOnce()
    expect(openPrivacy).toHaveBeenCalledOnce()
  })
})

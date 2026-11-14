import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OfflineRefusal } from '@/components/ui/offline-refusal'

describe('OfflineRefusal', () => {
  it.each(['create', 'calendar'] as const)('keeps its %s title and reason and shows no resting Orbit, because the surface works without the AI', (icon) => {
    const { container } = render(<OfflineRefusal icon={icon} title="Sem conexão" reason="Volte a ficar online para criar." />)
    expect(screen.getByText('Sem conexão')).toBeInTheDocument()
    expect(screen.getByText('Volte a ficar online para criar.')).toBeInTheDocument()
    expect(container.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })
})

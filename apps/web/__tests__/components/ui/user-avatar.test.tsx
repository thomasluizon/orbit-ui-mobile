import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAvatar } from '@/components/ui/user-avatar'

describe('UserAvatar', () => {
  it.each([
    [32, 12],
    [44, 17],
    [56, 20],
    [64, 28],
  ])('renders a %ipx disc with %ipx initials', (size, fontSize) => {
    render(<UserAvatar name="Alex Rivera" size={size} />)

    expect(screen.getByText('AR')).toHaveStyle({
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${fontSize}px`,
    })
  })
})

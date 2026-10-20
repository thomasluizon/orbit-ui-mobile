import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ProfileSettingsFrame,
} from '@/components/profile/profile-settings-frame'

describe('ProfileSettingsFrame', () => {
  it('keeps 32px between groups and 12px inside a populated group', () => {
    render(
      <ProfileSettingsFrame
        isLoading={false}
        loadingLabel="Loading profile"
        labels={{
          more: 'More of Orbit',
        }}
        rows={{ more: <div>About Orbit</div> }}
      />,
    )

    expect(screen.getByTestId('profile-settings-groups')).toHaveStyle({ gap: '32px' })
    expect(screen.getByTestId('profile-settings-group-more')).toHaveStyle({ gap: '12px' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'More of Orbit',
    ])
  })

})

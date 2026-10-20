import manifest from '../app/manifest'

describe('web app manifest', () => {
  it('publishes the generated Orbit PWA assets and platform canvas colours', () => {
    expect(manifest()).toEqual({
      name: 'Orbit',
      short_name: 'Orbit',
      start_url: '/',
      display: 'standalone',
      background_color: '#09090B',
      theme_color: '#09090B',
      icons: [
        {
          src: '/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    })
  })
})

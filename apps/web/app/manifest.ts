import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
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
  }
}

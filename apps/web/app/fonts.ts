import localFont from 'next/font/local'

export const rubik = localFont({
  src: [
    { path: '../fonts/rubik-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/rubik-latin.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/rubik-latin.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/rubik-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-rubik',
  display: 'swap',
})

export const inter = localFont({
  src: [
    { path: '../fonts/inter-latin.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/inter-latin.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/inter-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
})

export const roboto = localFont({
  src: [
    { path: '../fonts/roboto-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/roboto-latin.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/roboto-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-roboto',
  display: 'swap',
})

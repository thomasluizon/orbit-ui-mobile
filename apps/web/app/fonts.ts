import localFont from 'next/font/local'

export const geist = localFont({
  src: '../fonts/geist-latin.woff2',
  weight: '400 600',
  style: 'normal',
  variable: '--font-geist',
  display: 'swap',
})

export const spaceGrotesk = localFont({
  src: '../fonts/space-grotesk-latin.woff2',
  weight: '500 600',
  style: 'normal',
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const geistMono = localFont({
  src: '../fonts/geist-mono-latin.woff2',
  weight: '400 500',
  style: 'normal',
  variable: '--font-geist-mono',
  display: 'swap',
})

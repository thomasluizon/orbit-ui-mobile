import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Orbit - Personal Habit Tracker',
  description: 'Build better habits with AI-powered tracking and insights.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#07060e',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/* Anti-flash script: apply saved theme before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = document.cookie.match(/theme_mode=([^;]+)/)?.[1]
                if (theme === 'light') {
                  document.documentElement.classList.remove('dark')
                }
              } catch {}
            `,
          }}
        />
      </head>
      <body className="bg-background text-text-primary font-sans antialiased">
        {children}
      </body>
    </html>
  )
}

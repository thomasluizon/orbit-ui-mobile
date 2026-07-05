import { Providers } from '@/lib/providers'

/** Public onboarding group shell: mounts the app providers for the pre-auth wizard. */
export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <Providers>{children}</Providers>
}

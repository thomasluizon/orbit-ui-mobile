import { Providers } from '@/lib/providers'
import { FlowShell } from '@/components/shell/flow-shell'

/** Public onboarding group shell: mounts the app providers for the pre-auth wizard. */
export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Providers>
      <FlowShell>{children}</FlowShell>
    </Providers>
  )
}

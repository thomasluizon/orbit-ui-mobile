import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { AppToastHost } from '@/components/ui/app-toast-host'

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="flex min-h-dvh w-full flex-col bg-[var(--bg)] text-[var(--fg-1)]"
    style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
    <UpdateAvailableBanner />
    <div className="flex flex-1 flex-col items-center justify-center">{children}</div>
    <AppToastHost placement="page" />
  </main>
}

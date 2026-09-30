import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { AppToastHost } from '@/components/ui/app-toast-host'

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--bg)] text-[var(--fg-1)]"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      {children}
      <AppToastHost placement="page" />
    </main>
    <div className="fixed inset-x-0 top-[var(--safe-top)] z-sticky text-[var(--fg-1)]">
      <UpdateAvailableBanner />
    </div>
  </>
}

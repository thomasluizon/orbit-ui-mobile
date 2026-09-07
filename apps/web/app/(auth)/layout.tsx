export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="flex min-h-dvh w-full flex-col items-center bg-[var(--bg)] text-[var(--fg-1)] md:justify-center"
    style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>{children}</main>
}

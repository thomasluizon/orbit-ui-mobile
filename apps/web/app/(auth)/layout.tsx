/**
 * Auth layout: simple centered layout for login and auth-callback pages.
 * No bottom navigation or app chrome.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      {children}
    </div>
  )
}

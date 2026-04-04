import { redirect } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface ReferralRedirectPageProps {
  params: Promise<{ code: string }>
}

export default async function ReferralRedirectPage({ params }: ReferralRedirectPageProps) {
  const { code } = await params

  // Validate referral code format
  if (!code || !/^[a-zA-Z0-9_-]+$/.test(code)) {
    redirect('/login')
  }

  // Redirect to login with referral code as query param
  redirect(`/login?ref=${code}`)
}

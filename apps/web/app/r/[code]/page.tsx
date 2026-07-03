import { redirect } from 'next/navigation'
import { isValidReferralCode } from '@orbit/shared/utils'
import { resolveServerSession } from '@/lib/auth-api'

interface ReferralRedirectPageProps {
  params: Promise<{ code: string }>
}

export default async function ReferralRedirectPage({ params }: Readonly<ReferralRedirectPageProps>) {
  const { code } = await params

  if (!isValidReferralCode(code)) {
    redirect('/login')
  }

  const session = await resolveServerSession()
  if (session.token) {
    redirect(`/social?invite=${code}`)
  }

  redirect(`/login?ref=${code}`)
}

import { redirect } from 'next/navigation'
import { resolveServerSession } from '@/lib/auth-api'

interface ReferralRedirectPageProps {
  params: Promise<{ code: string }>
}

export default async function ReferralRedirectPage({ params }: Readonly<ReferralRedirectPageProps>) {
  const { code } = await params

  if (!code || !/^[a-zA-Z0-9_-]+$/.test(code)) {
    redirect('/login')
  }

  const session = await resolveServerSession()
  if (session.token) {
    redirect(`/social?invite=${code}`)
  }

  redirect(`/login?ref=${code}`)
}

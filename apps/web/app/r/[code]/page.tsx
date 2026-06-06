import { redirect } from 'next/navigation'

interface ReferralRedirectPageProps {
  params: Promise<{ code: string }>
}

export default async function ReferralRedirectPage({ params }: Readonly<ReferralRedirectPageProps>) {
  const { code } = await params

  if (!code || !/^[a-zA-Z0-9_-]+$/.test(code)) {
    redirect('/login')
  }

  redirect(`/login?ref=${code}`)
}

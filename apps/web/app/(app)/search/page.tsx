'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { CommandMenu } from '@/components/command/command-menu'
import { CalendarDays, ChartLine, Home, User } from '@/components/ui/icons'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'

export default function SearchPage() {
  const t = useTranslations()
  const router = useRouter()
  const [createTitle, setCreateTitle] = useState<string | null>(null)
  const navItems = [
    { id: 'hoje', label: t('nav.today'), icon: Home, onSelect: () => router.push('/') },
    { id: 'calendario', label: t('nav.calendar'), icon: CalendarDays, onSelect: () => router.push('/calendar') },
    { id: 'progresso', label: t('nav.progress'), icon: ChartLine, onSelect: () => router.push('/progress') },
    { id: 'perfil', label: t('nav.profile'), icon: User, onSelect: () => router.push('/profile') },
  ] as const
  return <>
    <AppBar title={t('habits.search.title')} onBack={() => router.back()} backLabel={t('common.back')} />
    <div className="max-w-[620px]">
      <CommandMenu resultsMode navItems={navItems} onCreateHabit={(title = '') => setCreateTitle(title)} onClose={() => {}} />
    </div>
    {createTitle !== null && <CreateHabitModal open initialTitle={createTitle} onOpenChange={(open) => { if (!open) setCreateTitle(null) }} />}
  </>
}

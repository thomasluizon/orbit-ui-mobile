'use client'

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { PageHeader } from '@/components/ui/page-header'

interface SubscreenLayerHost {
  element: HTMLElement | null
  setActive: (active: boolean) => void
}

const SubscreenLayerContext = createContext<SubscreenLayerHost | null>(null)

export function ProgressSubscreen({ screen, children, hideHeader = false }: Readonly<{ screen: ProgressSubmenuId; children: ReactNode; hideHeader?: boolean }>) {
  const router = useRouter()
  const t = useTranslations()
  const [layerElement, setLayerElement] = useState<HTMLDivElement | null>(null)
  const [layerActive, setLayerActive] = useState(false)
  const layerHost = useMemo(() => ({ element: layerElement, setActive: setLayerActive }), [layerElement])
  return <div className="mx-auto flex w-full min-w-0 max-w-[740px] flex-1 flex-col" data-progress-screen={screen}>
    <div hidden={layerActive} className="flex min-w-0 flex-1 flex-col">
      {!hideHeader ? <PageHeader title={t(`progressScreen.sections.${screen}`)} backLabel={t('progressScreen.back')} onBack={() => router.replace('/progress')} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-section-stack-gap px-screen-gutter py-4"><SubscreenLayerContext value={layerHost}>{children}</SubscreenLayerContext></div>
    </div>
    <div ref={setLayerElement} hidden={!layerActive} data-progress-layer="" className="flex min-h-0 min-w-0 flex-1 flex-col" />
  </div>
}

/** A full-surface layer over the sub-screen, such as a one-question flow. The sub-screen stays mounted and hidden under it. */
export function ProgressSubscreenLayer({ children }: Readonly<{ children: ReactNode }>) {
  const host = use(SubscreenLayerContext)
  const setActive = host?.setActive
  useEffect(() => {
    setActive?.(true)
    return () => setActive?.(false)
  }, [setActive])
  return host?.element ? createPortal(children, host.element) : null
}

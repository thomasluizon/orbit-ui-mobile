'use client'

import { useTranslations } from 'next-intl'
import { exportUserData } from '@/lib/actions/profile'
import { useAccountScopedState } from '@/hooks/use-session-reset'

export function useDataExport() {
  const t = useTranslations()
  /**
   * The done notice and the error both name the previous account's export, and the profile screen
   * they sit on never unmounts, so an account replacement left the next account reading that its
   * data had been downloaded when nobody had asked for it.
   */
  const [isExporting, setIsExporting] = useAccountScopedState(false)
  const [exportDone, setExportDone] = useAccountScopedState(false)
  const [exportError, setExportError] = useAccountScopedState<string | null>(null)

  async function exportData() {
    if (isExporting) return
    setIsExporting(true)
    setExportDone(false)
    setExportError(null)
    try {
      const data = await exportUserData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `orbit-data-export-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setExportDone(true)
    } catch {
      setExportError(t('dataExport.error'))
    } finally {
      setIsExporting(false)
    }
  }

  return {
    isExporting,
    exportDone,
    exportError,
    exportData,
    clearExportDone: () => setExportDone(false),
  }
}

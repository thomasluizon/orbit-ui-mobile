'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { exportUserData } from '@/app/actions/profile'

export function useDataExport() {
  const t = useTranslations()
  const [isExporting, setIsExporting] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

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

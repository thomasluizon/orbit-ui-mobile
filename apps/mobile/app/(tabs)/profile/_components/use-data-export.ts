import { useState } from 'react'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import type { UserDataExport } from '@orbit/shared'
import { apiClient } from '@/lib/api-client'
import { useOffline } from '@/hooks/use-offline'

/** Owns the profile data-export flow: writes the export JSON to a cache file and opens the native share sheet. */
export function useDataExport() {
  const { t } = useTranslation()
  const { isOnline } = useOffline()
  const [isExporting, setIsExporting] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [exportError, setExportError] = useState('')

  async function exportData() {
    if (isExporting) return
    if (!isOnline) {
      setExportError(t('errors.offline'))
      return
    }
    setIsExporting(true)
    setExportDone(false)
    setExportError('')
    try {
      const data = await apiClient<UserDataExport>(API.profile.export)
      const fileName = `orbit-data-export-${new Date().toISOString().slice(0, 10)}.json`
      const file = new File(Paths.cache, fileName)
      file.create({ overwrite: true })
      file.write(JSON.stringify(data, null, 2))
      await Sharing.shareAsync(file.uri, {
        dialogTitle: t('dataExport.shareTitle'),
        mimeType: 'application/json',
      })
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

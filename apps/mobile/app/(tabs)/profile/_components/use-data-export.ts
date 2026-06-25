import { useState } from 'react'
import { Share } from 'react-native'
import { File, Paths } from 'expo-file-system'
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
  const [exportError, setExportError] = useState('')

  async function exportData() {
    if (isExporting) return
    if (!isOnline) {
      setExportError(t('errors.offline'))
      return
    }
    setIsExporting(true)
    setExportError('')
    try {
      const data = await apiClient<UserDataExport>(API.profile.export)
      const fileName = `orbit-data-export-${new Date().toISOString().slice(0, 10)}.json`
      const file = new File(Paths.cache, fileName)
      file.create({ overwrite: true })
      file.write(JSON.stringify(data, null, 2))
      await Share.share({
        title: t('dataExport.shareTitle'),
        url: file.uri,
      })
    } catch {
      setExportError(t('dataExport.error'))
    } finally {
      setIsExporting(false)
    }
  }

  return { isExporting, exportError, exportData }
}

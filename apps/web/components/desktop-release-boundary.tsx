'use client'

import { lazy, Suspense, useState, useSyncExternalStore, type ReactNode } from 'react'

const DesktopReleaseShell = lazy(() => import('./desktop-release-shell').then(module => ({ default: module.DesktopReleaseShell })))

function subscribeToShell() { return () => {} }
function isDesktopShell() { return '__TAURI_INTERNALS__' in window }
function serverShell() { return false }

export function DesktopReleaseBoundary({ children, ...options }: Readonly<{
  children: ReactNode
  monitor?: boolean
  minimum?: string
}>) {
  const shell = useSyncExternalStore(subscribeToShell, isDesktopShell, serverShell)
  const [updateRequired, setUpdateRequired] = useState<ReactNode>(null)
  return <>
    {updateRequired ?? children}
    {shell && <Suspense fallback={null}><DesktopReleaseShell {...options} onUpdateRequired={setUpdateRequired} /></Suspense>}
  </>
}

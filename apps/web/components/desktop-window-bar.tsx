'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react'
import { captureException } from '@sentry/nextjs'
import { useTranslations } from 'next-intl'
import { IconButton } from '@/components/ui/icon-button'
import { Minus, MoreVertical, Square, Squares, X } from '@/components/ui/icons'
import {
  DESKTOP_MAXIMIZE_HOVER_EVENT,
  DESKTOP_WINDOW_BAR_END_INSET,
  DESKTOP_WINDOW_BAR_HEIGHT,
  DESKTOP_WINDOW_TRAFFIC_LIGHT_INSET,
  desktopWindowPlatform,
  holdDesktopWindowBar,
  invokeDesktopWindow,
  type DesktopWindowAction,
  type DesktopWindowAnchor,
  type DesktopWindowPlatform,
} from '@/lib/desktop-window'

function subscribeToShell() { return () => {} }
function serverPlatform() { return null }

function useWindowCommands() {
  const [maximized, setMaximized] = useState(false)
  const run = useCallback((action: DesktopWindowAction, anchor?: DesktopWindowAnchor) => {
    invokeDesktopWindow(action, anchor).then(setMaximized).catch(captureException)
  }, [])
  useEffect(() => {
    run('state')
    const onResize = () => run('state')
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [run])
  return { maximized, run }
}

function useNativeMaximizeHover() {
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    const onHover = (event: Event) => setHovered((event as CustomEvent<boolean>).detail === true)
    window.addEventListener(DESKTOP_MAXIMIZE_HOVER_EVENT, onHover)
    return () => window.removeEventListener(DESKTOP_MAXIMIZE_HOVER_EVENT, onHover)
  }, [])
  return hovered
}

function WindowBar({ platform }: Readonly<{ platform: DesktopWindowPlatform }>) {
  const t = useTranslations('desktopWindow')
  const { maximized, run } = useWindowCommands()
  const maximizeHovered = useNativeMaximizeHover()
  const keyboardMenu = useRef(false)
  const windowControls = useRef<HTMLFieldSetElement>(null)
  useEffect(() => holdDesktopWindowBar(captureException), [])
  const onDragAreaMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget || event.detail > 2) return
    event.preventDefault()
    run(event.detail === 2 ? 'toggle_maximize' : 'drag')
  }
  const onBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    keyboardMenu.current = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
  }
  const onBarContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const fromKeyboard = keyboardMenu.current
    keyboardMenu.current = false
    if (platform !== 'windows') return
    if (!fromKeyboard && windowControls.current?.contains(event.target as Node)) return
    const focused = fromKeyboard ? (event.target as Element).getBoundingClientRect() : null
    run('system_menu', focused ? { x: focused.left, y: focused.bottom } : undefined)
  }
  return (
    <div
      role="presentation"
      data-desktop-window-bar-content=""
      data-platform={platform}
      className="orbit-window-bar fixed inset-x-0 top-0 z-tooltip flex items-stretch bg-[var(--bg)] text-[var(--fg-1)]"
      style={{ height: DESKTOP_WINDOW_BAR_HEIGHT, paddingInlineStart: platform === 'macos' ? DESKTOP_WINDOW_TRAFFIC_LIGHT_INSET : DESKTOP_WINDOW_BAR_END_INSET, paddingInlineEnd: DESKTOP_WINDOW_BAR_END_INSET }}
      onKeyDown={onBarKeyDown}
      onPointerDown={() => { keyboardMenu.current = false }}
      onContextMenu={onBarContextMenu}
    >
      {platform === 'windows' && (
        <div className="flex items-center">
          <IconButton label={t('menu')} aria-haspopup="menu" data-window-action="menu" onClick={() => run('menu')}>
            <MoreVertical size={20} strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
        </div>
      )}
      <div role="presentation" className="min-w-0 flex-1" onMouseDown={onDragAreaMouseDown} />
      {platform === 'windows' && (
        <fieldset ref={windowControls} aria-label={t('controls')} className="flex items-center min-w-0">
          <IconButton label={t('minimize')} data-window-action="minimize" onClick={() => run('minimize')}>
            <Minus size={20} strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
          <IconButton label={t(maximized ? 'restore' : 'maximize')} data-window-action="maximize" data-native-hover={maximizeHovered || undefined} onClick={() => run('toggle_maximize')}>
            {maximized ? <Squares size={20} strokeWidth={1.5} aria-hidden="true" /> : <Square size={20} strokeWidth={1.5} aria-hidden="true" />}
          </IconButton>
          <IconButton label={t('close')} data-window-action="close" onClick={() => run('close')}>
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
        </fieldset>
      )}
    </div>
  )
}

/** The one Orbit-drawn top bar of the desktop shell. It renders only where the shell has no native title bar. */
export function DesktopWindowBar() {
  const platform = useSyncExternalStore(subscribeToShell, desktopWindowPlatform, serverPlatform)
  return platform ? <WindowBar platform={platform} /> : null
}

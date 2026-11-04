import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { bundleGeometry } from '@/__tests__/support/profile-settings-browser'

const entry = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { NextIntlClientProvider, useTranslations } from 'next-intl';
  import en from '../../packages/shared/src/i18n/en.json';
  import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
  import { createMockHabit } from '../../packages/shared/src/__tests__/factories';
  import { computeParentPromptChain } from '../../packages/shared/src/utils';
  import { DeferredConfirmDialogs as HabitListConfirmDialogs } from './components/habits/habit-list/deferred-confirm-dialogs';
  import { HabitRow } from './components/habits/habit-row';
  import { ShellWide } from './components/shell/shell-wide';
  import { AppToastHost } from './components/ui/app-toast-host';
  import { useAppToastStore } from './stores/app-toast-store';
  import { useUIStore } from './stores/ui-store';
  const root = document.getElementById('root');
  const date = '2026-09-12';
  const parent = createMockHabit({id:'parent', scheduledDates:[date]});
  const child = createMockHabit({id:'child', parentId:parent.id, scheduledDates:[date]});
  const ancestors = computeParentPromptChain(child.id, new Map([[parent.id,parent],[child.id,child]]), date, {
    getChildren: id => id === parent.id ? [child] : [], isRelevantToday: () => true,
    isDueOnSelectedDate: () => true, skippedIds: new Set([child.id])
  });
  const prompt = {...ancestors[0], childId:child.id, ancestors, selectedCount:1, date};
  function Example() {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const current = useAppToastStore(state => state.currentToast);
    const overlays = useUIStore(state => state.openOverlayIds);
    return <ShellWide nav={false} notice={<AppToastHost />}>
      <HabitRow habit={child} actions={{onSkip: () => {
        setOpen(true);
        useAppToastStore.getState().showQueued(t('undo.habitSkipped'), t('undo.action'), () => { root.dataset.restored = 'child'; });
      }}} />
      <output data-current>{current?.toast.message}</output><output data-overlays>{overlays.join(',')}</output>
      <HabitListConfirmDialogs t={t} parentPrompt={open ? prompt : null} showDeleteConfirm={false} deletePending={false}
        deleteHabitName="" deleteDescendantCount={0} duplicateHabitName={null}
        onSelectParentAncestor={() => {}} onConfirmDelete={() => {}} onCancelDelete={() => {}} onDeleteClosed={() => {}}
        onConfirmDuplicate={() => {}} onCancelDuplicate={() => {}}
        onCancelParent={() => setOpen(false)} onConfirmParent={() => {
          useAppToastStore.getState().showQueued('Parent skipped', 'Undo parent', () => { root.dataset.restored = 'parent'; });
          setOpen(false);
        }} />
    </ShellWide>;
  }
  const locale = root.dataset.locale;
  createRoot(root).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC"><Example /></NextIntlClientProvider>);
`

describe('parent undo presentation with mounted modal transitions', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = bundleGeometry(entry, {
      '@/hooks/use-time-format': 'export const useTimeFormat = () => ({displayTime: value => value});',
      'next/navigation': "export { unstable_isUnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'; export const useRouter = () => ({push: () => {}});",
    })
  }, 60_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['cancel', 'confirm', 'close', 'escape'] as const).map(dismissal => ({ width, locale, dismissal })),
  )))('returns child undo after $dismissal at $width in $locale', async ({ width, locale, dismissal }) => {
    const words = locale === 'en' ? en : ptBR
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.clock.install()
      await page.setContent(`<style>${stylesheet}</style><div id="root" data-locale="${locale}"></div>`)
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: words.habits.actions.more }).click()
      await page.getByRole('menuitem', { name: words.habits.actions.skip }).click()
      const dialog = page.getByRole('dialog', { name: words.habits.autoSkipParentTitle })
      await dialog.waitFor()
      expect(await page.locator('[data-kind]').count()).toBe(0)
      expect(await page.locator('[data-current]').textContent()).toBe(words.undo.habitSkipped)
      if (dismissal === 'escape') await page.keyboard.press('Escape')
      else await dialog.getByRole('button', { name: {
        cancel: words.common.notNow, confirm: words.habits.autoSkipParentConfirm, close: words.common.close,
      }[dismissal] }).click()
      await expect.poll(() => dialog.count()).toBe(0)
      await expect.poll(async () => ({
        notice: await page.locator('[data-shell-notice-content] [data-kind]').count(),
        current: await page.locator('[data-current]').textContent(),
        overlays: await page.locator('[data-overlays]').textContent(),
      })).toEqual({ notice: 1, current: words.undo.habitSkipped, overlays: '' })
      await page.clock.runFor(4900)
      await page.getByRole('button', { name: words.undo.action, exact: true }).click()
      expect(await page.locator('#root').getAttribute('data-restored')).toBe('child')
    } finally { await page.close() }
  })
})

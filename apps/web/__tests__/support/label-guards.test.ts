import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { IncomingMessage, Server, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { cloneElement, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { userCalendarsSchema } from '@orbit/shared/types/calendar'
import { profileSchema } from '@orbit/shared/types/profile'
import { tagListSchema } from '@orbit/shared/types/tag'
import { mintHermeticJwt } from '@/test-support/hermetic/hermetic-session'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'
import { CalendarLegend } from '@/app/(app)/calendar/_components/calendar-shell'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { HabitRow } from '@/components/habits/habit-row'
import { HabitRowContent } from '@/components/habits/habit-row-content'
import { EventRow } from '@/components/dates/event-row'
import { PersonalText } from '@/components/ui/personal-text'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { loadAppFonts } from './app-fonts'
import { expectFillShape, expectInteractionFill } from '@/e2e/layout/label-interaction-fill'
import { expectLabelsFit, expectLegendFits, markUserText } from '@/e2e/layout/label-fit-contract'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

describe('label fixture calendars and tags through the hermetic session', () => {
  let server: Server
  const calendars = userCalendarsSchema.parse([
    { id: 'calendar-1', name: 'Meu calendário pessoal de compromissos e encontros', accessRole: 'owner', primary: true, backgroundColor: null, isSynced: true },
    { id: 'calendar-2', name: 'Trabalho', accessRole: 'owner', primary: false, backgroundColor: null, isSynced: true },
  ])
  const tags = tagListSchema.parse(Array.from({ length: 21 }, (_, index) => ({
    id: `tag-${index}`, name: `Tag ${index}`, color: '#808080',
  })))

  beforeAll(async () => {
    const listen = vi.spyOn(Server.prototype, 'listen').mockReturnThis()
    try {
      await import('@/test-support/hermetic/mock-api/server')
      server = listen.mock.contexts[0] as Server
    } finally {
      listen.mockRestore()
    }
  })

  function requestFixture(path: string, token?: string) {
    const request = new IncomingMessage(new Socket())
    request.method = 'GET'
    request.url = path
    if (token) request.headers.authorization = `Bearer ${token}`
    const response = new ServerResponse(request)
    const end = vi.spyOn(response, 'end').mockReturnValue(response)
    try {
      server.emit('request', request, response)
      return { status: response.statusCode, body: JSON.parse(String(end.mock.calls[0]?.[0])) as unknown }
    } finally {
      end.mockRestore()
      request.destroy()
    }
  }

  it('returns a schema-valid empty list without a calendars claim', () => {
    for (const token of [undefined, mintHermeticJwt(profileFixture)]) {
      const response = requestFixture('/api/calendar/calendars', token)
      expect(response.status).toBe(200)
      expect(userCalendarsSchema.parse(response.body)).toEqual([])
    }
  })

  it('carries two connected calendars alongside the profile to the server-side route', () => {
    const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
    const token = mintHermeticJwt(profile, calendars)
    const response = requestFixture('/api/calendar/calendars', token)
    expect(response.status).toBe(200)
    expect(userCalendarsSchema.parse(response.body)).toEqual(calendars)
    expect(profileSchema.parse(requestFixture('/api/profile', token).body)).toEqual(profile)
    expect(requestFixture('/api/calendar/calendars', mintHermeticJwt(profile)).body).toEqual([])
  })

  it('rejects invalid calendars and malformed sessions at the mock API boundary', () => {
    const invalidCalendars = Reflect.apply(mintHermeticJwt, undefined, [profileFixture, [{}]]) as string
    for (const token of [invalidCalendars, 'invalid.payload.signature']) {
      expect(requestFixture('/api/calendar/calendars', token).status).toBe(400)
    }
  })

  it('returns a schema-valid empty list without a tags claim', () => {
    for (const token of [undefined, mintHermeticJwt(profileFixture)]) {
      const response = requestFixture('/api/tags', token)
      expect(response.status).toBe(200)
      expect(tagListSchema.parse(response.body)).toEqual([])
    }
  })

  it('carries searchable tags alongside the profile and calendars to the server-side route', () => {
    const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
    const token = mintHermeticJwt(profile, calendars, tags)
    const response = requestFixture('/api/tags', token)
    expect(response.status).toBe(200)
    expect(tagListSchema.parse(response.body)).toEqual(tags)
    expect(profileSchema.parse(requestFixture('/api/profile', token).body)).toEqual(profile)
    expect(userCalendarsSchema.parse(requestFixture('/api/calendar/calendars', token).body)).toEqual(calendars)
    expect(requestFixture('/api/tags', mintHermeticJwt(profile)).body).toEqual([])
  })

  it('rejects invalid tags and malformed sessions at the mock API boundary', () => {
    const invalidTags = Reflect.apply(mintHermeticJwt, undefined, [profileFixture, undefined, [{}]]) as string
    for (const token of [invalidTags, 'invalid.payload.signature']) {
      const response = requestFixture('/api/tags', token)
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'Invalid hermetic tags session' })
    }
  })
})

describe('label and interaction fill guards in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 840].flatMap((width) => (['dark', 'light'] as const).map((mode) => ({ width, mode }))))(
    'measures tab indicator interaction fills at $width px in $mode mode',
    async ({ width, mode }) => {
      const tabs = renderToStaticMarkup(createElement(BottomTabBar, {
        label: en.nav.mainNavigation, activeId: 'hoje', onSelect: () => {},
        items: SHELL_DESTINATION_IDS.map((id) => ({
          id, label: en.nav[DESTINATION_ICONS[id].commandId],
          icon: ({ active }: { active: boolean }) => createElement(DestinationIcon, {
            destination: id, active, color: active ? 'var(--primary)' : 'var(--fg-3)',
          }),
        })),
      }))
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', mode))
          .map(([name, value]) => `${name}: ${value};`).join(' ')
        await page.setContent(`<!doctype html><html class="${mode}"><style>${stylesheet}
          :root { ${variables} }
        </style>${tabs}</html>`)
        await loadAppFonts(page)
        const indicators = page.locator('nav > button [data-tab-indicator]')
        expect(await indicators.count()).toBe(SHELL_DESTINATION_IDS.length)
        for (const indicator of await indicators.all()) {
          await expectInteractionFill(indicator)
        }
      } finally {
        await page.close()
      }
    },
  )

  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    it.each([320, 600].flatMap((width) => [1, 2].map((textScale) => ({ width, textScale }))))(
      `keeps typed sheet title interaction fills padded at $width px and text scale $textScale in ${locale}`,
      async ({ width, textScale }) => {
        const title = locale === 'pt-BR' ? 'Leitura' : 'Reading'
        const sheet = render(cloneElement(createElement(NextIntlClientProvider),
          { locale, messages: words, timeZone: 'UTC' },
          createElement(Sheet, { title, titleMode: 'typed', onClose: () => {} }),
        ))
        const page = await browser.newPage({ viewport: { width, height: 915 } })
        try {
          await act(async () => {})
          const variables = Object.entries(resolveWebThemeVariables('orange', 'dark'))
            .map(([name, value]) => `${name}: ${value};`).join(' ')
          await page.setContent(`<!doctype html><style>${stylesheet}
            :root { ${variables} font-size: ${16 * textScale}px; }
          </style>${sheet.baseElement.innerHTML}`)
          await loadAppFonts(page)
          await page.evaluate(() => {
            for (const animation of document.getAnimations()) animation.finish()
          })
          const trigger = page.getByRole('button', { name: title })
          await expectInteractionFill(trigger)
          const bounds = await trigger.boundingBox()
          const closeBounds = await page.getByRole('button', { name: words.common.close }).boundingBox()
          expect(bounds!.height).toBeGreaterThanOrEqual(48)
          expect(closeBounds!.width).toBe(48)
          expect(closeBounds!.height).toBeGreaterThanOrEqual(48)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(closeBounds!.x)
        } finally {
          await page.close()
          sheet.unmount()
        }
      },
    )

    it.each([
      { name: 'fitting', clipped: false },
      { name: 'clipped', clipped: true },
    ])(`checks $name status metadata from HabitRowContent in ${locale}`, async ({ clipped }) => {
      const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
      const title = 'Caminhar pelo bairro depois do trabalho e conversar com os amigos'
      const content = renderToStaticMarkup(createElement(HabitRowContent, {
        habit: createMockHabit({ title }), titleSize: 17, titleColor: 'var(--fg-1)',
        meta: [{ kind: 'overdue', label: words.habits.overdue }, '08:00',
          words.habits.rowProgress.replace('{done}', '1').replace('{total}', '2')],
      }))
      try {
        await page.setContent(`<style>${stylesheet}
          [data-habit-row-meta] { ${clipped ? 'width: 10px;' : ''} }
        </style><main style="padding: 0 16px"><button data-habit-row-body style="display: flex; width: 100%; text-align: left">
          ${content}<span>Description<br>continues<br>as prose</span></button><button>Edit</button></main>`)
        await loadAppFonts(page)
        await markUserText(page, [title])
        const assertion = expectLabelsFit(page, page, [title])
        if (clipped) await expect(assertion).rejects.toThrow('app-authored labels must remain whole')
        else await assertion
      } finally {
        await page.close()
      }
    })

    it.each([320, 360, 384, 412])(`measures the merged personal Calendar CheckRow and EventRow at %ipx in ${locale}`, async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      const title = 'Caminhar pelo bairro depois do trabalho e conversar com os amigos'
      const eventTitle = 'Reunião de planejamento com todas as pessoas da minha equipe'
      const source = 'Meu calendário pessoal de compromissos e encontros'
      const rows = renderToStaticMarkup(createElement('div', null,
        createElement(CheckRow, { label: title, textMode: 'personal', onOpenLabel: () => {}, checked: false, value: words.calendar.status.missed, onChange: () => {} }),
        createElement(EventRow, { title: eventTitle, time: '09:00', source, onClick: () => {} }),
      ))
      try {
        await page.setContent(`<style>${stylesheet}</style><main style="padding: 0 32px">${rows}<button>Edit</button></main>`)
        await loadAppFonts(page)
        await markUserText(page, [title, eventTitle, source])
        await markUserText(page, [title, eventTitle, source])
        expect(await page.locator('[data-layout-text-origin="user"]').count()).toBe(3)
        await expectLabelsFit(page, page.getByRole('main'), [title, eventTitle, source])
      } finally {
        await page.close()
      }
    })

    it.each([320, 360, 384, 412])(`measures the Hoje HabitRow before and after its options disclosure at %ipx in ${locale}`, async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      const title = 'Caminhar pelo bairro depois do trabalho e conversar com os amigos'
      const row = renderToStaticMarkup(cloneElement(createElement(NextIntlClientProvider),
        { locale, messages: words, timeZone: 'UTC' },
        createElement(HabitRow, { habit: createMockHabit({ title }), actions: { onDetail: () => {} } }),
      ))
      try {
        await page.setContent(`<style>${stylesheet}</style><main style="padding: 0 16px">${row}<button>Edit</button></main>
          <div role="dialog" hidden><div role="menu"><button role="menuitem">${words.habits.refresh}</button></div></div>`)
        await loadAppFonts(page)
        await markUserText(page, [title])
        await expectLabelsFit(page, page, [title])
        await page.evaluate(() => {
          document.querySelector('main')!.setAttribute('aria-hidden', 'true')
          document.querySelector<HTMLElement>('[role="dialog"]')!.hidden = false
        })
        await markUserText(page, [title])
        await expect(expectLabelsFit(page, page, [title])).rejects.toThrow('required user field must retain its rendered mark')
        await expectLabelsFit(page, page.getByRole('dialog'))
        await page.evaluate(() => {
          document.querySelector('main')!.removeAttribute('aria-hidden')
          document.querySelector<HTMLElement>('[role="dialog"]')!.hidden = true
        })
        await markUserText(page, [title])
        await expectLabelsFit(page, page, [title])
      } finally {
        await page.close()
      }
    })

    it.each([320, 360, 384, 412])(`rejects the unclamped Calendar CheckRow title at %ipx in ${locale}`, async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      const title = 'Caminhar pelo bairro depois do trabalho e conversar com os amigos'
      const row = renderToStaticMarkup(createElement(CheckRow, {
        label: title, checked: false, value: words.calendar.status.missed, onChange: () => {},
      }))
      try {
        await page.setContent(`<style>${stylesheet}</style><div style="padding: 0 48px">${row}</div>`)
        await loadAppFonts(page)
        await markUserText(page, [title])
        await expect(expectLabelsFit(page, page, [title])).rejects.toThrow('user text must stay within two visible lines')
        await page.locator('[data-layout-text-origin="user"]').evaluate((element) => {
          element.classList.add('line-clamp-2')
        })
        await expectLabelsFit(page, page, [title])
      } finally {
        await page.close()
      }
    })

    it.each([
      { name: 'whole labels', labelStyle: '', error: null },
      { name: 'wrapped label', labelStyle: 'max-width: 40px;', error: 'app-authored labels must stay on one line' },
      { name: 'ellipsized label', labelStyle: 'max-width: 40px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;', error: 'app-authored labels must remain whole' },
    ])(`checks $name in the ${locale} calendar legend sheet rows`, async ({ labelStyle, error }) => {
      const page = await browser.newPage()
      const legend = renderToStaticMarkup(createElement(CalendarLegend, {
        loggableLabel: words.calendar.legend.loggable, fullLabel: words.calendar.legend.full,
        partialLabel: words.calendar.legend.partial, noneLabel: words.calendar.legend.none,
      }))
      try {
        await page.setContent(`<style>
          .flex { display: flex; } .flex-col { flex-direction: column; }
          .inline-flex { display: inline-flex; } .items-center { align-items: center; }
          .shrink-0 { flex-shrink: 0; }
        </style><button>Outside<br>label</button><div role="dialog" style="width: 272px">${legend}</div>`)
        await page.getByText(words.calendar.legend.full, { exact: true }).evaluate((element, style) => {
          element.setAttribute('style', `${element.getAttribute('style')}; ${style}`)
        }, labelStyle)
        const assertion = expectLegendFits(page.getByRole('dialog').locator(':scope > div'), Object.values(words.calendar.legend))
        if (error) await expect(assertion).rejects.toThrow(error)
        else await assertion
      } finally {
        await page.close()
      }
    })
  }

  it('rejects an empty required legend inventory', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div role="dialog">Legend</div>')
      await expect(expectLegendFits(page.getByRole('dialog'), [])).rejects.toThrow('required legend inventory must not be empty')
    } finally {
      await page.close()
    }
  })

  it('measures a transitioned hover fill on a control with a transparent resting surface', async () => {
    const page = await browser.newPage()
    try {
      await page.bringToFront()
      await page.setContent(`<!doctype html><style>
        button { width: 80px; height: 48px; border: 0; border-radius: 8px; background: transparent;
          transition: background-color 240ms ease; }
        button:hover { background: rgb(180, 180, 180); }
        button:active { background: rgb(140, 140, 140); }
      </style><button>Options</button>`)
      await expectInteractionFill(page.locator('button'))
    } finally {
      await page.close()
    }
  })

  it('measures painted ellipsized text and still rejects a touching fill', async () => {
    const email = `${'longaddress'.repeat(12)}@example.com`
    const text = renderToStaticMarkup(createElement(PersonalText, null, email))
    const page = await browser.newPage()
    try {
      await page.bringToFront()
      await page.setContent(`<!doctype html><style>${stylesheet}
        button { width: 200px; min-height: 48px; padding: 8px 16px; border: 0; border-radius: 12px;
          background: rgb(220, 220, 220); }
        button:hover { background: rgb(180, 180, 180); }
        button:active { background: rgb(140, 140, 140); }
      </style><button>${text}</button>`)
      await loadAppFonts(page)
      const rawOverflow = await page.locator('[data-personal-text]').evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getBoundingClientRect().right - element.getBoundingClientRect().right
      })
      expect(rawOverflow).toBeGreaterThan(100)
      await expectInteractionFill(page.locator('button'))

      await page.locator('button').evaluate((element) => { element.style.paddingInline = '0' })
      await expect(expectFillShape(page.locator('button'), 'touching')).rejects.toThrow('fill has inline breathing room')
      await page.locator('button').evaluate((element) => { element.style.paddingInline = '16px' })
      await expectFillShape(page.locator('button'), 'restored')
    } finally { await page.close() }
  })

  it('excludes text fully clipped by an ancestor', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        button { width: 120px; min-height: 48px; padding: 8px 16px; border: 0; border-radius: 12px;
          background: rgb(220, 220, 220); }
        .clip { display: block; height: 0; overflow: hidden; }
      </style><button>Options<span class="clip"><span>Unpainted text that exceeds the fill</span></span></button>`)
      await expectFillShape(page.locator('button'), 'clipped')
    } finally { await page.close() }
  })

  it.each([
    { name: 'visible layer', hoverOpacity: '0.5', pressOpacity: '0.5', ancestorOpacity: '1', error: null },
    { name: 'invisible hover layer', hoverOpacity: '0', pressOpacity: '1', ancestorOpacity: '1', error: 'hover: the fill has visible effective opacity' },
    { name: 'invisible held press layer', hoverOpacity: '1', pressOpacity: '0', ancestorOpacity: '1', error: 'press: the fill has visible effective opacity' },
    { name: 'invisible fill ancestor', hoverOpacity: '1', pressOpacity: '1', ancestorOpacity: '0', error: 'hover: the fill has visible effective opacity' },
  ])('checks effective opacity for the $name through the full interaction sequence', async ({ hoverOpacity, pressOpacity, ancestorOpacity, error }) => {
    const page = await browser.newPage()
    try {
      await page.bringToFront()
      await page.setContent(`<!doctype html><style>
        button { position: relative; width: 100px; height: 48px; border: 0; border-radius: 8px;
          background: transparent; opacity: ${ancestorOpacity}; }
        [data-press-fill] { position: absolute; inset: 0; border-radius: 8px; display: grid;
          place-items: center; background: rgb(220, 220, 220); }
        button:hover [data-press-fill] { background: rgb(180, 180, 180); opacity: ${hoverOpacity}; }
        button:active [data-press-fill] { background: rgb(140, 140, 140); opacity: ${pressOpacity}; }
      </style><button><span data-press-fill>Options</span></button>`)
      const assertion = expectInteractionFill(page.locator('button'))
      if (error) await expect(assertion).rejects.toThrow(error)
      else await assertion
    } finally {
      await page.close()
    }
  })

  it('closes a popup opened on pointer down before measuring the next control', async () => {
    const page = await browser.newPage()
    try {
      await page.bringToFront()
      await page.setContent(`<!doctype html><style>
        button { width: 80px; height: 48px; border: 0; border-radius: 8px; background: rgb(220, 220, 220); }
        button:hover { background: rgb(180, 180, 180); }
        button:active { background: rgb(140, 140, 140); }
        [role="menu"] { position: fixed; top: 100px; left: 0; }
      </style><button id="trigger">Options</button><button id="next">Next</button>
      <div role="menu" hidden>Refresh</div>
      <script>
        document.querySelector('#trigger').addEventListener('pointerdown', () => {
          document.querySelector('[role="menu"]').hidden = false;
        });
        document.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          const popup = document.querySelector('[role="menu"]');
          if (popup) setTimeout(() => {
            popup.remove();
            document.querySelector('#next').replaceWith(document.querySelector('#next').cloneNode(true));
          }, 50);
        });
      </script>`)
      await expectInteractionFill(page.locator('#trigger'))
      expect(await page.getByRole('menu').count()).toBe(0)
      await expectInteractionFill(page.locator('#next'))
    } finally {
      await page.close()
    }
  })

  it.each([
    { name: 'centered partial fill', inset: '12px', passes: false },
    { name: 'full control fill', inset: '0', passes: true },
    { name: 'fill inset within tolerance', inset: '1px', passes: true },
    { name: 'fill outside within tolerance', inset: '-1px', passes: true },
    { name: 'left edge inset beyond tolerance', inset: '0 0 0 2px', passes: false },
    { name: 'right edge inset beyond tolerance', inset: '0 2px 0 0', passes: false },
    { name: 'top edge inset beyond tolerance', inset: '2px 0 0 0', passes: false },
    { name: 'bottom edge inset beyond tolerance', inset: '0 0 2px 0', passes: false },
    { name: 'fill extending beyond the control', inset: '-2px', passes: false },
  ])('checks the $name against every control edge', async ({ inset, passes }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        button { position: relative; width: 64px; height: 64px; padding: 0; border: 0; border-radius: 8px; }
        [data-press-fill] { position: absolute; inset: ${inset}; display: grid; place-items: center;
          border-radius: 8px; background: rgb(220, 220, 220); }
        svg { width: 16px; height: 16px; }
      </style><button><span data-press-fill><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg></span></button>`)
      const assertion = expectFillShape(page.locator('button'), 'hover')
      if (passes) await assertion
      else await expect(assertion).rejects.toThrow(/fill.*control/)
    } finally {
      await page.close()
    }
  })

  it.each([
    { name: 'stacked spans', display: 'block', attributes: '', passes: false },
    { name: 'inline spans', display: 'inline', attributes: '', passes: true },
    { name: 'stacked state spans', display: 'block', attributes: 'data-state="open"', passes: false },
    { name: 'inline state spans', display: 'inline', attributes: 'data-state="open"', passes: true },
  ])('checks a composed label with $name as one label', async ({ display, attributes, passes }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>button span { display: ${display}; }</style>
        <button ${attributes}><span>Completion</span> <span>rate</span></button>`)
      const assertion = expectLabelsFit(page)
      if (passes) await assertion
      else await expect(assertion).rejects.toThrow('app-authored labels must stay on one line')
    } finally {
      await page.close()
    }
  })

  it('rejects a full-size fill with an unpainted pseudo-element hit extension', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        button { position: relative; width: 64px; height: 64px; border: 0; border-radius: 8px;
          background: rgb(220, 220, 220); }
        button::before { content: ""; position: absolute; inset: -4px; }
      </style><button>Go</button>`)
      await expect(expectFillShape(page.locator('button'), 'press')).rejects.toThrow('a hit extension must also carry the fill')
    } finally {
      await page.close()
    }
  })

  it.each([
    { name: 'separate captions', content: '<span data-layout-label>Completion</span><span data-layout-label>rate</span>', passes: true },
    { name: 'separate title and description', content: '<h3>Completion</h3><span data-layout-label>rate</span>', passes: true },
    { name: 'separate stat value and caption', content: '<div data-state="default"><span>100%</span><span>Completion rate</span></div>', wrapper: 'div', passes: true },
    { name: 'excluded user text', content: '<span data-layout-text-origin="user">A long title<br>from a person</span><span data-layout-label>Edit</span>', passes: true },
    { name: 'app action beside excluded user text', content: '<span data-layout-text-origin="user">A long title<br>from a person</span><span data-layout-label>Edit<br>habit</span>', passes: false },
    { name: 'wrapped plain text', content: '<span data-layout-label style="width: 50px">Completion rate</span>', passes: false },
  ])('preserves the one-line contract for $name', async ({ content, wrapper = 'button', passes }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>span { display: block; } h3 { margin: 0; }</style><${wrapper}>${content}</${wrapper}>`)
      const assertion = expectLabelsFit(page)
      if (passes) await assertion
      else await expect(assertion).rejects.toThrow('app-authored labels must stay on one line')
    } finally {
      await page.close()
    }
  })

  it('rejects clipped composed labels even when they occupy one line', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        button { width: 60px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      </style><button><span>Completion</span> <span>rate</span></button>`)
      await expect(expectLabelsFit(page)).rejects.toThrow('app-authored labels must remain whole')
    } finally {
      await page.close()
    }
  })

  it.each([
    { name: 'two-line title and separate metadata', title: 'Typed title<br>second line', metadata: '3 / 12 books', error: null },
    { name: 'three-line typed title', title: 'Typed title<br>second line<br>third line', metadata: '3 / 12 books', error: 'user text must stay within two visible lines' },
    { name: 'wrapped metadata beneath typed text', title: 'Typed title', metadata: '3 / 12<br>books', error: 'app-authored labels must stay on one line' },
  ])('measures $name by its text origin', async ({ title, metadata, error }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>span { display: block; }</style>
        <button><span><span data-layout-text-origin="user">${title}</span><span>${metadata}</span></span></button>`)
      const assertion = expectLabelsFit(page)
      if (error) await expect(assertion).rejects.toThrow(error)
      else await assertion
    } finally {
      await page.close()
    }
  })

  it.each([
    { name: 'two-line ellipsis', clamp: 2, overflow: 'hidden', error: null },
    { name: 'three-line ellipsis', clamp: 3, overflow: 'hidden', error: 'user text must stay within two visible lines' },
    { name: 'hard clipping', clamp: 0, overflow: 'hidden', error: 'user text must use an ellipsis when clipped' },
  ])('checks user text with $name', async ({ clamp, overflow, error }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        [data-layout-text-origin] { display: -webkit-box; -webkit-box-orient: vertical;
          -webkit-line-clamp: ${clamp}; width: 100px; line-height: 20px; overflow: ${overflow};
          ${clamp ? '' : 'max-height: 40px;'} }
      </style><button>Edit</button><span data-layout-text-origin="user">A person wrote a long title that needs several lines to display completely</span>`)
      const assertion = expectLabelsFit(page)
      if (error) await expect(assertion).rejects.toThrow(error)
      else await assertion
    } finally {
      await page.close()
    }
  })

  it('rejects a typed email broken inside its token and accepts the personal row rendering', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    const email = `${'longaddress'.repeat(12)}@example.com`
    try {
      await page.setContent(`<style>${stylesheet}</style><button>Edit</button>
        <span data-layout-text-origin="user" style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;width:180px;overflow:hidden;overflow-wrap:anywhere">${email}</span>`)
      await expect(expectLabelsFit(page)).rejects.toThrow('user text must never break inside a word or token')
      const row = renderToStaticMarkup(createElement(ListRow, { title: 'Account', description: email, textMode: 'personal', href: '/profile/account' }))
      await page.setContent(`<style>${stylesheet}</style><main>${row}<button>Edit</button></main>`)
      await loadAppFonts(page)
      await markUserText(page, [email])
      await expectLabelsFit(page, page, [email])
    } finally { await page.close() }
  })

  it('allows the unclamped rename heading while retaining word-boundary checks', async () => {
    const title = Array(3).fill('Read a long chapter and discuss the details with the reading group').join(' ')
    const heading = render(createElement('h1', { style: { fontSize: 22, lineHeight: 1.4 } }, createElement('button', { type: 'button', 'aria-label': title, style: { width: '100%', whiteSpace: 'normal' } }, cloneElement(createElement(PersonalText, null, title), { unclamped: true }))))
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="width:288px">${heading.container.innerHTML}<button>Rename</button></main>`)
      await loadAppFonts(page)
      await expectLabelsFit(page, page, [title])
    } finally { await page.close(); heading.unmount() }
  })

  it('measures the visual copy of a split row without exposing it twice to assistive technology', async () => {
    const email = `${'longaddress'.repeat(12)}@example.com`
    const row = render(createElement(ListRow, { title: 'Account', description: email, textMode: 'personal', personalExpanded: false, onClick: () => {} }))
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main>${row.container.innerHTML}<button>Edit</button></main>`)
      await loadAppFonts(page)
      await markUserText(page, [email])
      await expectLabelsFit(page, page, [email])
      await page.getByRole('button', { name: `Account, ${email}` }).evaluate((element) => {
        const control = element as HTMLElement
        control.style.setProperty('transition', 'none', 'important')
        control.style.setProperty('background-color', 'rgb(220, 220, 220)', 'important')
      })
      await expectFillShape(page.getByRole('button', { name: `Account, ${email}` }), 'resting')
    } finally { await page.close(); row.unmount() }
  })

  it('marks the typed field beside a decorative emoji and requires its current rendered mark', async () => {
    const page = await browser.newPage()
    const title = 'A title written by a person'
    try {
      await page.setContent(`<button>Edit</button><span><span aria-hidden="true">🌱 </span>${title}</span>`)
      await markUserText(page, [title])
      await expectLabelsFit(page, page, [title])
      expect(await page.locator('[data-layout-text-origin="user"]').count()).toBe(1)
      await page.locator('[data-layout-text-origin="user"]').evaluate((element) => {
        element.replaceWith(element.cloneNode(true))
        document.querySelector('[data-layout-text-origin]')!.removeAttribute('data-layout-text-origin')
      })
      await expect(expectLabelsFit(page, page, [title])).rejects.toThrow('required user field must retain its rendered mark')
    } finally {
      await page.close()
    }
  })

  it.each(['display: none', 'visibility: hidden', 'visibility: collapse'])('ignores a sidebar copy hidden with %s when measuring the Perfil account row', async (hiddenStyle) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    const name = 'Pessoa com um nome completo escrito no próprio perfil'
    const email = 'pessoa.com.um.endereco.longo@exemplo.org'
    const row = renderToStaticMarkup(createElement(ListRow, { title: name, description: email, textMode: 'personal', href: '/profile/account' }))
    try {
      await page.setContent(`<style>${stylesheet}</style>
        <aside style="${hiddenStyle}; width: 60px"><span>${name}</span><span>${email}</span></aside>
        <main>${row}<button>Edit</button></main>`)
      await loadAppFonts(page)
      await expect(page.getByText(name, { exact: true }).isVisible()).rejects.toThrow('strict mode violation')
      expect(await page.getByRole('main').getByText(name, { exact: true }).isVisible()).toBe(true)
      expect(await page.getByRole('main').getByText(email, { exact: true }).isVisible()).toBe(true)
      await markUserText(page, [name, email])
      await expectLabelsFit(page, page, [name, email])
      await page.getByRole('main').evaluate((element) => element.remove())
      await expect(expectLabelsFit(page, page, [name, email])).rejects.toThrow('required user field must retain its rendered mark')
    } finally {
      await page.close()
    }
  })
})

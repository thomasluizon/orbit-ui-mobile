import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cloneElement, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CalendarLegend } from '@/app/(app)/calendar/_components/calendar-shell'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { HabitRow } from '@/components/habits/habit-row'
import { EventRow } from '@/components/dates/event-row'
import { loadAppFonts } from './app-fonts'
import { expectFillShape, expectInteractionFill } from '@/e2e/layout/label-interaction-fill'
import { expectLabelsFit, expectLegendFits, markUserText } from '@/e2e/layout/label-fit-contract'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

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

  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
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

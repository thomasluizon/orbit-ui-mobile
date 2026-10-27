import { execFileSync } from 'node:child_process'

export function measureSplitSegmentWords(): string[] {
  return [...document.querySelectorAll('[role="radio"] > span, [data-segmented-control] [data-menu-trigger] > span, [role="menu"] .orbit-menu-label')].flatMap((label) => {
    const text = label.firstChild!
    return [...text.textContent!.matchAll(/\S+/g)].filter((word) => {
      const range = document.createRange()
      range.setStart(text, word.index)
      range.setEnd(text, word.index + word[0].length)
      return new Set([...range.getClientRects()].map((fragment) => Math.round(fragment.top))).size > 1
    }).map((word) => word[0])
  })
}

let browserBundle: Promise<string> | undefined

async function buildBrowserBundle() {
  const script = `import { build } from 'esbuild'; const bundle = await build({
    stdin: { contents: ${JSON.stringify(`
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import en from '@orbit/shared/i18n/en.json';
      import ptBR from '@orbit/shared/i18n/pt-BR.json';
      import { SegmentedControl } from './components/ui/segmented-control';
      for (const group of [...document.querySelectorAll('[role="radiogroup"]')]) {
        const props = {
          label: group.getAttribute('aria-label'),
          fullWidth: group.classList.contains('w-full'),
          disabled: group.getAttribute('aria-disabled') === 'true',
          options: [...group.querySelectorAll('[role="radio"]')].map(option => ({
            value: option.value, label: option.textContent, disabled: option.disabled,
          })),
          value: group.querySelector('[aria-checked="true"]')?.value,
        };
        const original = group.closest('[data-segmented-control]') ?? group;
        const host = document.createElement('div');
        host.style.display = 'block';
        host.style.width = '100%';
        original.replaceWith(host);
        function Control() {
          const [value, setValue] = React.useState(props.value);
          return React.createElement(NextIntlClientProvider, { locale: document.documentElement.lang || 'en', messages: document.documentElement.lang === 'pt-BR' ? ptBR : en }, React.createElement(SegmentedControl, { ...props, value, onChange: setValue }));
        }
        createRoot(host).render(React.createElement(Control));
      }
    `)}, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    alias: { '@sentry/nextjs': '@sentry/browser' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  }); process.stdout.write(bundle.outputFiles[0].text);`
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
}

export async function mountMeasuredSegmentedControls(page: import('@playwright/test').Page) {
  browserBundle ??= buildBrowserBundle()
  await page.addScriptTag({ content: await browserBundle })
  await settleSegmentMeasurements(page)
}

export async function settleSegmentMeasurements(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

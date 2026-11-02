import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
let attachmentScript: string
registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(() => {
  attachmentScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const result = await build(JSON.parse(process.argv[1]));
    process.stdout.write(result.outputFiles[0].text);
  `, JSON.stringify({
    stdin: { contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import en from '../../packages/shared/src/i18n/en.json';
      import { useChatImageAttachment } from './hooks/use-chat-image-attachment';
      function Composer() {
        const [error, setError] = React.useState(null);
        const attachment = useChatImageAttachment(setError);
        return <><input aria-label="Photo" type="file" onChange={attachment.handleFileSelect} />
          <textarea aria-label="Message" onPaste={attachment.handlePaste} />
          <output>{error}</output><img alt="Preview" src={attachment.imagePreview || undefined} />
          <button onClick={() => { window.uploadedImage = attachment.selectedImage }}>Send</button></>;
      }
      createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="en" messages={en}><Composer /></NextIntlClientProvider>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  })], { maxBuffer: 10 * 1024 * 1024 }).toString()
})
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it.each([4000, 640].flatMap(width => (['pick', 'paste'] as const).map(method => ({ width, method }))))('resizes a $width pixel $method before preview and upload', async ({ width, method }) => {
  const page = await browser.newPage()
  try {
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: attachmentScript })
    await page.getByLabel('Photo').waitFor()
    await page.evaluate(async ({ width, method }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = width * 3 / 4
      const context = canvas.getContext('2d')!
      context.fillStyle = '#123456'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
      const transfer = new DataTransfer()
      transfer.items.add(new File([blob], 'photo.png', { type: blob.type }))
      if (method === 'pick') {
        const input = document.querySelector('input')!
        input.files = transfer.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        document.querySelector('textarea')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
      }
    }, { width, method })
    await expect.poll(() => page.getByAltText('Preview').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(Math.min(width, 1024))
    expect(await page.getByAltText('Preview').evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(Math.min(width, 1024) * 3 / 4)
    await page.getByRole('button', { name: 'Send' }).click()
    const uploaded = await page.evaluate(async () => {
      const file = Reflect.get(window, 'uploadedImage') as File
      const bitmap = await createImageBitmap(file)
      const result = { width: bitmap.width, height: bitmap.height, type: file.type, size: file.size }
      bitmap.close()
      return result
    })
    expect(uploaded).toMatchObject({ width: Math.min(width, 1024), height: Math.min(width, 1024) * 3 / 4, type: 'image/jpeg' })
    expect(uploaded.size).toBeGreaterThan(0)
  } finally { await page.close() }
})

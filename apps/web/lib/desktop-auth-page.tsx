import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToReadableStream } from 'react-dom/server.edge'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AuthPagePanel } from '@/components/auth/auth-page-panel'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { PillAnchor } from '@/components/ui/pill-anchor'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const fonts = `
@font-face { font-family:Geist; font-weight:400 600; src:url(data:font/woff2;base64,${readFileSync(join(process.cwd(), 'fonts/geist-latin.woff2')).toString('base64')}) format('woff2'); }
@font-face { font-family:'Space Grotesk'; font-weight:500 600; src:url(data:font/woff2;base64,${readFileSync(join(process.cwd(), 'fonts/space-grotesk-latin.woff2')).toString('base64')}) format('woff2'); }
`
const themeStyles = (['dark', 'light'] as const).map(mode =>
  `.${mode}{color-scheme:${mode};${Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')}}`,
).join('')
const styles = `${fonts}${themeStyles}
:root { --font-sans:Geist,sans-serif; --font-display:'Space Grotesk',sans-serif; --r-card:20px; }
* { box-sizing:border-box; margin:0; }
html { font-synthesis:none; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; }
body { background:var(--bg); color:var(--fg-1); font-family:var(--font-sans); }
main { min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; }
h1 { font-family:var(--font-display); font-size:22px; font-weight:500; line-height:1.2; letter-spacing:-0.02em; text-wrap:balance; }
p { font-size:16px; line-height:1.55; color:var(--fg-2); overflow-wrap:anywhere; text-wrap:pretty; }
.desktop-auth-message { display:flex; flex-direction:column; gap:8px; }
.orbit-pill-action { display:inline-flex; align-items:center; justify-content:center; align-self:flex-start; white-space:nowrap; position:relative; border-radius:999px; color:var(--fg-on-primary); background:var(--primary); text-decoration:none; font-weight:500; font-family:var(--font-sans); transition:background-color 240ms cubic-bezier(0.2,0,0,1); }
.orbit-pill-action::after { content:""; position:absolute; inset:-4px 0; }
.orbit-pill-action:focus-visible { outline:2px solid var(--fg-1); outline-offset:2px; }
.orbit-pill-action:active { background:var(--primary-pressed); }
@media (hover:hover) and (pointer:fine) { .orbit-pill-action:hover { background:var(--primary-hover); } }
@media (prefers-reduced-motion:reduce) { .orbit-pill-action { transition-duration:0.01ms; } }
`
const openAppScript = `window.addEventListener('load',function(){window.location.href=document.querySelector('a').href;},{once:true});`

export async function desktopAuthPage(destination: URL, locale: string, mode: 'light' | 'dark', nonce: string | null = null) {
  const language = locale === 'pt-BR' ? 'pt-BR' : 'en'
  const t = createTranslator({ locale: language, messages: language === 'pt-BR' ? ptBR : en, namespace: 'auth.desktopCallback' })
  const failed = destination.searchParams.has('error')
  const title = t(failed ? 'failureTitle' : 'successTitle')
  const stream = await renderToReadableStream(
    <html lang={language} className={mode}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="referrer" content="no-referrer" />
        <title>{`${title} | Orbit`}</title>
        <style>{styles}</style>
      </head>
      <body>
        <main>
          <AuthPagePanel>
            <OrbitMark size={128} accent />
            <div className="desktop-auth-message">
              <h1>{title}</h1>
              <p>{t(failed ? 'failureBody' : 'successBody')}</p>
            </div>
            <PillAnchor href={destination.toString()}>{t('openApp')}</PillAnchor>
          </AuthPagePanel>
        </main>
        {nonce ? <script nonce={nonce}>{openAppScript}</script> : null}
      </body>
    </html>,
  )
  await stream.allReady
  return { body: stream, headers: {
    'Content-Type': 'text/html; charset=utf-8',
  } }
}

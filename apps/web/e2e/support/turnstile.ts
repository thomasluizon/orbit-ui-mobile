import type { Page } from '@playwright/test'

const turnstileScript = `(() => {
  const widgets = new Map();
  let nextId = 0;

  function solve(widgetId) {
    setTimeout(() => {
      const options = widgets.get(widgetId);
      if (options) options.callback('XXXX.DUMMY.TOKEN.XXXX');
    }, 0);
  }

  window.turnstile = {
    render(container, options) {
      const widgetId = 'smoke-turnstile-' + nextId++;
      widgets.set(widgetId, options);
      solve(widgetId);
      return widgetId;
    },
    reset(widgetId) {
      solve(widgetId);
    },
    remove(widgetId) {
      widgets.delete(widgetId);
    }
  };
})();`

export async function installTurnstileStub(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: turnstileScript })
  })
}

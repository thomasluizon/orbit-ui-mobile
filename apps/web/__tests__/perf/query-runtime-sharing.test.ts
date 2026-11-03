// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each(['apps/web', 'apps/mobile'])('propagates %s query focus changes to shared subscribers', (workspace) => {
  const events = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module';
    import { resolve } from 'node:path';
    const requireApp = createRequire(resolve('../..', process.argv[1], 'package.json'));
    const requireShared = createRequire(resolve('../../packages/shared/package.json'));
    const appFocus = requireApp('@tanstack/react-query').focusManager;
    const sharedFocus = requireShared('@tanstack/query-core').focusManager;
    const events = [];
    appFocus.setFocused(false);
    const unsubscribe = sharedFocus.subscribe(focused => events.push(focused));
    appFocus.setFocused(true);
    appFocus.setFocused(false);
    unsubscribe();
    appFocus.setFocused(true);
    process.stdout.write(JSON.stringify(events));
  `, workspace], { encoding: 'utf8' })) as boolean[]

  expect(events).toEqual([true, false])
})

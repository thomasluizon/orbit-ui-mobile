/**
 * RuleTester coverage for the `local/*` gates.
 *
 * Each rule gets its intended catch AND the shapes that must stay silent. The
 * `valid` cases are the load-bearing half: several of these rules were caught
 * false-positiving on real Orbit code during #539 bundle 4a, and every such shape
 * is pinned here so the next edit cannot quietly reintroduce it.
 */

import { RuleTester } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import { afterAll, describe, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const rule = (name) => require(`../${name}.cjs`)

ruleTester.run('no-decorative-glow', rule('no-decorative-glow'), {
  valid: [
    '<PillButton glow={false}>Save</PillButton>',
    'const ring = "shadow-[inset_0_0_0_1.5px_var(--primary)]"',
    '<div className="shadow-sm" />',
    // The sanctioned shadows are pure greyscale occlusion (DESIGN.md:177), so a
    // hue is what separates a shadow from a glow - not which token produced it.
    'const shadow = { boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }',
    'const sh2 = { boxShadow: "0 4px 16px rgba(0,0,0,.28)" }',
    'const sh3 = { boxShadow: "0 12px 40px rgba(0,0,0,.45)" }',
    // A ring or hairline has ZERO blur, so it can never glow even carrying a hue.
    'const hairline = { boxShadow: "0 0 0 0.5px rgba(255,255,255,0.06)" }',
    'const ringed = { boxShadow: "0 0 0 6px var(--bg)" }',
    'const insetAccent = { boxShadow: "inset 0 0 8px var(--primary)" }',
  ],
  invalid: [
    { code: 'const c = "shadow-[var(--primary-glow)]"', errors: [{ messageId: 'noGlowToken' }] },
    { code: '<div style={{ boxShadow: "var(--primary-glow)" }} />', errors: [{ messageId: 'noGlowToken' }] },
    { code: '<PillButton glow>Save</PillButton>', errors: [{ messageId: 'noGlowProp' }] },
    { code: 'const s = [styles.fab, primaryGlow(tokens)]', errors: [{ messageId: 'noGlowToken' }] },
    {
      code: '<div className="shadow-[0_8px_28px_rgba(var(--primary-rgb),0.45)]" />',
      errors: [{ messageId: 'noHandRolledGlow' }],
    },
    // The exact glow that shipped in PR #560, the PR that bans glow. It escaped
    // because the old test looked for `--primary-rgb` and this is `--status-frozen`.
    {
      code: '<div style={{ boxShadow: "0 0 60px color-mix(in srgb, var(--status-frozen) 40%, transparent)" }} />',
      errors: [{ messageId: 'noHandRolledGlow' }],
    },
    // Shadow properties are read in ANY object now, not only a JSX `style`
    // attribute, so the entire mobile StyleSheet surface is no longer invisible.
    {
      code: 'const styles = StyleSheet.create({ orb: { boxShadow: "0 0 40px rgba(134,89,234,0.5)" } })',
      errors: [{ messageId: 'noHandRolledGlow' }],
    },
    {
      code: 'const glow = { boxShadow: "0 0 24px #8659EA" }',
      errors: [{ messageId: 'noHandRolledGlow' }],
    },
    {
      code: 'const named = { boxShadow: "0 0 30px violet" }',
      errors: [{ messageId: 'noHandRolledGlow' }],
    },
  ],
})

ruleTester.run('no-raw-gradient', rule('no-raw-gradient'), {
  valid: [
    '<div className="bg-[var(--bg-elev)]" />',
    'const mask = { maskImage: "radial-gradient(transparent 58%, black 60%)" }',
    '<div className="from-left to-right" />',
  ],
  invalid: [
    { code: 'const c = "var(--gradient-header)"', errors: [{ messageId: 'noGradientToken' }] },
    { code: 'const s = { background: "linear-gradient(180deg, #22094f, transparent)" }', errors: [{ messageId: 'noGradientFunction' }] },
    { code: '<div className="bg-gradient-to-b from-black" />', errors: [{ messageId: 'noGradientClass' }] },
    { code: '<LinearGradient colors={c} />', errors: [{ messageId: 'noGradientElement' }] },
    { code: 'import { LinearGradient } from "expo-linear-gradient"', errors: [{ messageId: 'noGradientImport' }] },
  ],
})

ruleTester.run('no-gradient-text', rule('no-gradient-text'), {
  valid: [
    '<h1 className="bg-clip-text bg-[var(--primary)]" />',
    '<div className="bg-gradient-to-r from-a to-b" />',
  ],
  invalid: [
    { code: '<h1 className="bg-gradient-to-r from-a to-b bg-clip-text text-transparent" />', errors: [{ messageId: 'noGradientText' }] },
  ],
})

ruleTester.run('no-side-stripe-border', rule('no-side-stripe-border'), {
  valid: [
    '<div className="border-l border-[var(--hairline)]" />',
    '<div className="border-l-4" />',
    '<View style={{ borderLeftWidth: 1, borderLeftColor: t.hairline }} />',
  ],
  invalid: [
    { code: '<div className="border-l-4 border-[var(--primary)]" />', errors: [{ messageId: 'noSideStripe' }] },
    { code: '<View style={{ borderLeftWidth: 4, borderLeftColor: t.primary }} />', errors: [{ messageId: 'noSideStripe' }] },
  ],
})

ruleTester.run('no-fullbleed-button', rule('no-fullbleed-button'), {
  valid: [
    '<PillButton>Save</PillButton>',
    '<PillButton fullWidth={false}>Save</PillButton>',
    // No pill radius: a full-width row / menu item / card button is legitimate layout, not a CTA.
    '<button className="w-full flex items-center">Row</button>',
    // A pill with no width utility hugs its content — nothing to flag.
    '<PillButton className="rounded-full px-6">Save</PillButton>',
    // flagFullWidthProp:false (the web config) leaves the prop unflagged, since the web
    // PillButton self-caps fullWidth at the desktop breakpoint; the className vector still applies.
    { code: '<PillButton fullWidth>Save</PillButton>', options: [{ flagFullWidthProp: false }] },
  ],
  invalid: [
    // flagFullWidthProp defaults ON (the mobile config, no desktop self-cap): a bare fullWidth is flagged.
    { code: '<PillButton fullWidth>Save</PillButton>', errors: [{ messageId: 'noFullWidthProp' }] },
    { code: '<PillButton fullWidth={true}>Save</PillButton>', errors: [{ messageId: 'noFullWidthProp' }] },
    // The raw uncapped-pill vector: a pill radius combined with a full-width utility.
    { code: '<button className="rounded-full w-full">Save</button>', errors: [{ messageId: 'noFullWidthClass' }] },
    { code: '<PillButton className="rounded-full flex-1">Save</PillButton>', errors: [{ messageId: 'noFullWidthClass' }] },
    // The className vector is flagged independently of the prop option.
    {
      code: '<button className="rounded-full w-full">Save</button>',
      options: [{ flagFullWidthProp: false }],
      errors: [{ messageId: 'noFullWidthClass' }],
    },
  ],
})

ruleTester.run('no-overshoot-easing', rule('no-overshoot-easing'), {
  valid: [
    'const e = "cubic-bezier(0.2, 0, 0, 1)"',
    'const e = "cubic-bezier(0.4, 0, 0.2, 1)"',
  ],
  invalid: [
    { code: 'const e = "cubic-bezier(0.34, 1.56, 0.64, 1)"', errors: [{ messageId: 'noOvershoot' }] },
    { code: 'const e = "cubic-bezier(0.5, -0.5, 0.5, 1)"', errors: [{ messageId: 'noOvershoot' }] },
  ],
})

ruleTester.run('no-space-x-y', rule('no-space-x-y'), {
  valid: ['<div className="flex gap-3" />', '<div className="space-between" />'],
  invalid: [{ code: '<div className="space-y-3" />', errors: [{ messageId: 'noSpaceUtility' }] }],
})

ruleTester.run('no-arbitrary-zindex', rule('no-arbitrary-zindex'), {
  valid: [
    '<div className="relative z-[1]" />',
    '<div className="sticky top-0 z-[3]" />',
    '<div className="z-40" />',
    '<div className="z-modal" />',
    '<div className="z-tour-spotlight" />',
    'const s = { zIndex: 2 }',
    'const s = { zIndex: -1 }',
    'const s = { zIndex: zLayers.modal }',
    'const s = { elevation: 12 }',
    'const s = StyleSheet.create({ overlay: { zIndex: zLayers.toast } })',
  ],
  invalid: [
    { code: '<div className="z-[9999]" />', errors: [{ messageId: 'arbitraryClass' }] },
    { code: '<div className="fixed inset-0 z-[10003]" />', errors: [{ messageId: 'arbitraryClass' }] },
    { code: '<div style={{ zIndex: 9999 }} />', errors: [{ messageId: 'rawZIndex' }] },
    { code: 'const s = StyleSheet.create({ overlay: { zIndex: 10000 } })', errors: [{ messageId: 'rawZIndex' }] },
  ],
})

ruleTester.run('no-dynamic-tailwind-class', rule('no-dynamic-tailwind-class'), {
  valid: [
    '<div className={`flex ${isActive ? "bg-red-500" : "bg-blue-500"}`} />',
    '<div className={`${animateEntry ? "animate-msg-in " : ""}flex ${isUser ? "justify-end" : "justify-start"}`} />',
    '<div className={cn("flex", extra)} />',
  ],
  invalid: [
    { code: '<svg className={`size-${size} animate-spin`} />', errors: [{ messageId: 'noDynamicClass' }] },
    { code: '<div className={`bg-${tone}-600`} />', errors: [{ messageId: 'noDynamicClass' }] },
    { code: '<div className={"text-" + color} />', errors: [{ messageId: 'noDynamicClass' }] },
  ],
})

ruleTester.run('require-focus-replacement', rule('require-focus-replacement'), {
  valid: [
    '<input className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" />',
    '<input className="border" />',
  ],
  invalid: [
    { code: '<input className="flex-1 bg-transparent outline-none" />', errors: [{ messageId: 'noBareOutlineNone' }] },
    { code: '<input className="outline-none focus:ring-2" />', errors: [{ messageId: 'noBareOutlineNone' }] },
  ],
})

ruleTester.run('no-placeholder-alt', rule('no-placeholder-alt'), {
  valid: ['<img alt="" />', '<img alt="Astra waving at a completed streak" />'],
  invalid: [
    { code: '<img alt="image" />', errors: [{ messageId: 'noPlaceholderAlt' }] },
    { code: '<img alt="Photo" />', errors: [{ messageId: 'noPlaceholderAlt' }] },
  ],
})

ruleTester.run('require-dialog-title', rule('require-dialog-title'), {
  valid: [
    '<DialogContent><DialogTitle>Delete habit</DialogTitle></DialogContent>',
    '<DialogContent><DialogHeader><DialogTitle className="sr-only">x</DialogTitle></DialogHeader></DialogContent>',
    '<div><p>not a dialog</p></div>',
  ],
  invalid: [
    { code: '<DialogContent><p>Are you sure?</p></DialogContent>', errors: [{ messageId: 'missingTitle' }] },
    { code: '<SheetContent><Body /></SheetContent>', errors: [{ messageId: 'missingTitle' }] },
  ],
})

ruleTester.run('no-dead-href', rule('no-dead-href'), {
  valid: ['<a href="/upgrade">Upgrade</a>', '<button onClick={fn}>Act</button>'],
  invalid: [{ code: '<a href="#" onClick={fn}>Act</a>', errors: [{ messageId: 'noDeadHref' }] }],
})

ruleTester.run('no-user-scalable-no', rule('no-user-scalable-no'), {
  valid: [
    'export const viewport = { themeColor: "#020618" }',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  ],
  invalid: [
    { code: 'export const viewport = { userScalable: false }', errors: [{ messageId: 'noZoomLock' }] },
    { code: 'export const viewport = { maximumScale: 1 }', errors: [{ messageId: 'noZoomLock' }] },
    {
      code: '<meta name="viewport" content="width=device-width, user-scalable=no" />',
      errors: [{ messageId: 'noZoomLock' }],
    },
  ],
})

ruleTester.run('animate-presence-exit', rule('animate-presence-exit'), {
  valid: [
    '<AnimatePresence><m.div exit={{ opacity: 0 }} /></AnimatePresence>',
    // The ancestor lives at the call site in another file — the sound composition.
    '<m.div exit={{ opacity: 0 }} />',
    // A non-motion child is composed elsewhere and cannot be judged here.
    '<AnimatePresence>{rows.map((r) => <NotificationRow key={r.id} />)}</AnimatePresence>',
  ],
  invalid: [
    {
      code: '<AnimatePresence>{show && <m.div initial={{ opacity: 0 }} />}</AnimatePresence>',
      errors: [{ messageId: 'presenceChildWithoutExit' }],
    },
  ],
})

ruleTester.run('animate-presence-stable-key', rule('animate-presence-stable-key'), {
  valid: [
    '<AnimatePresence>{rows.map((row) => <m.li key={row.id} exit={{}} />)}</AnimatePresence>',
    '<div>{rows.map((row, index) => <li key={index} />)}</div>',
  ],
  invalid: [
    {
      code: '<AnimatePresence>{rows.map((row, index) => <m.li key={index} exit={{}} />)}</AnimatePresence>',
      errors: [{ messageId: 'indexKey' }],
    },
  ],
})

ruleTester.run('no-jsx-logical-and', rule('no-jsx-logical-and'), {
  valid: [
    '<div>{isOpen && <Panel />}</div>',
    '<div>{count > 0 && <List />}</div>',
    '<div>{items.length > 0 ? <List /> : null}</div>',
    '<div>{!hidden && <Panel />}</div>',
  ],
  invalid: [
    { code: '<div>{items.length && <List />}</div>', errors: [{ messageId: 'noLogicalAnd' }] },
  ],
})

ruleTester.run('no-nested-component-definition', rule('no-nested-component-definition'), {
  valid: [
    'function Row() { return <li /> }\nfunction List() { return <ul><Row /></ul> }',
    'function List() { const renderRow = (r) => <li>{r}</li>; return <ul>{rows.map(renderRow)}</ul> }',
  ],
  invalid: [
    {
      code: 'function List() { function Row() { return <li /> } return <ul><Row /></ul> }',
      errors: [{ messageId: 'nestedComponent' }],
    },
  ],
})

ruleTester.run('will-change-discipline', rule('will-change-discipline'), {
  valid: [
    '<div className={isAnimating ? "will-change-transform" : ""} />',
    '<div className="transition-transform" />',
  ],
  invalid: [
    { code: '<div className="will-change-transform" />', errors: [{ messageId: 'noStaticWillChange' }] },
    { code: '<div className="will-change-[all]" />', errors: [{ messageId: 'noWillChangeAll' }] },
    { code: '<div style={{ willChange: "all" }} />', errors: [{ messageId: 'noWillChangeAll' }] },
  ],
})

ruleTester.run('no-raw-font-feature-tag', rule('no-raw-font-feature-tag'), {
  valid: [
    'const s = { fontVariantNumeric: "tabular-nums" }',
    'const s = { fontWeight: 600 }',
    'const s = { fontVariationSettings: \'"GRAD" 150\' }',
  ],
  invalid: [
    { code: 'const s = { fontVariationSettings: \'"wght" 600\' }', errors: [{ messageId: 'rawTag' }] },
    { code: 'const s = { fontFeatureSettings: \'"tnum" 1\' }', errors: [{ messageId: 'rawTag' }] },
  ],
})

ruleTester.run('no-calc-percentage-width', rule('no-calc-percentage-width'), {
  valid: [
    '<div style={{ width: "calc(100% - 32px)" }} />',
    '<div className="w-[calc(100%-var(--app-px)*2)]" />',
    '<div className="grid grid-cols-3 gap-4" />',
  ],
  invalid: [
    { code: '<div className="w-[calc(33%-1rem)]" />', errors: [{ messageId: 'noCalcWidth' }] },
    { code: '<div style={{ width: "calc(50% - 8px)" }} />', errors: [{ messageId: 'noCalcWidth' }] },
  ],
})

ruleTester.run('no-scroll-listener-motion', rule('no-scroll-listener-motion'), {
  valid: [
    'requestAnimationFrame(() => setIsVisible(true))',
    'observer.observe(node)',
    'window.addEventListener("resize", onResize)',
  ],
  invalid: [
    { code: 'window.addEventListener("scroll", onScroll)', errors: [{ messageId: 'noScrollListener' }] },
    {
      code: 'window.addEventListener("scroll", () => setOffset(window.scrollY))',
      errors: [{ messageId: 'noScrollIntoState' }],
    },
    {
      code: 'const loop = () => { setProgress(p); requestAnimationFrame(loop) }; requestAnimationFrame(() => { setProgress(1); requestAnimationFrame(loop) })',
      errors: [{ messageId: 'noRafState' }],
    },
  ],
})

ruleTester.run('no-draggable-onscroll', rule('no-draggable-onscroll'), {
  valid: [
    '<DraggableFlatList data={rows} onScrollOffsetChange={handleOffsetChange} />',
    '<FlatList data={rows} onScroll={handleScroll} scrollEventThrottle={16} />',
    '<DraggableFlatList data={rows} onScrollBeginDrag={handleScrollBeginDrag} />',
  ],
  invalid: [
    {
      code: '<DraggableFlatList data={rows} onScroll={handleScroll} />',
      errors: [{ messageId: 'noDiscardedScrollProp' }],
    },
    {
      code: '<DraggableFlatList data={rows} scrollEventThrottle={16} />',
      errors: [{ messageId: 'noDiscardedScrollProp' }],
    },
    {
      code: '<DraggableFlatList data={rows} onScroll={handleScroll} scrollEventThrottle={16} />',
      errors: [{ messageId: 'noDiscardedScrollProp' }, { messageId: 'noDiscardedScrollProp' }],
    },
  ],
})

ruleTester.run('react19-api', rule('react19-api'), {
  valid: ['const v = use(ThemeContext)', 'function Row({ ref }) { return <li ref={ref} /> }'],
  invalid: [
    { code: 'const C = forwardRef((props, ref) => <div ref={ref} />)', errors: [{ messageId: 'forwardRefRemoved' }] },
    { code: 'const v = useContext(ThemeContext)', errors: [{ messageId: 'useContextReplaced' }] },
    { code: 'const v = React.useContext(ThemeContext)', errors: [{ messageId: 'useContextReplaced' }] },
  ],
})

ruleTester.run('spacing-scale', rule('spacing-scale'), {
  valid: [
    '<div style={{ gap: 12, paddingInline: 16 }} />',
    '<div style={{ marginTop: 0, marginBottom: -8 }} />',
    '<div style={{ padding: "24px" }} />',
    '<div style={{ width: 34, height: 220, fontSize: 13 }} />',
    '<div style={{ gap: tokens.gap, padding: spacing.md }} />',
    '<div className="flex gap-3 px-4 pb-10" />',
    '<div className="absolute inset-0 top-0 md:mt-6" />',
    '<div className="p-px w-4 z-40 rounded-2xl grid-cols-2 space-y-2 translate-y-2 top-1/2" />',
    '<div className="gap-[16px] mt-[1.5rem]" />',
    '<div style={{ top: 1, right: -1 }} />',
    'const s = StyleSheet.create({ row: { gap: 8, paddingVertical: 20 } })',
    {
      code: 'const s = StyleSheet.create({ row: { gap: 9, paddingX: 26 } })',
      filename: 'packages/shared/src/theme/button.ts',
      options: [{ exemptFiles: ['packages/shared/src/theme/button.ts'] }],
    },
    { code: '<div style={{ gap: 10 }} />', options: [{ allow: [10] }] },
  ],
  invalid: [
    {
      code: '<div style={{ gap: 13 }} />',
      output: '<div style={{ gap: 12 }} />',
      errors: [{ messageId: 'offScaleStyle' }],
    },
    {
      code: '<div style={{ paddingVertical: 9, gap: 7 }} />',
      output: '<div style={{ paddingVertical: 8, gap: 8 }} />',
      errors: [{ messageId: 'offScaleStyle' }, { messageId: 'offScaleStyle' }],
    },
    {
      code: '<div style={{ marginTop: -3 }} />',
      output: '<div style={{ marginTop: -4 }} />',
      errors: [{ messageId: 'offScaleStyle' }],
    },
    {
      code: '<div style={{ padding: "15px" }} />',
      output: '<div style={{ padding: "16px" }} />',
      errors: [{ messageId: 'offScaleStyle' }],
    },
    {
      code: '<div style={{ gap: 10 }} />',
      output: null,
      errors: [{ messageId: 'offScaleStyle' }],
    },
    {
      code: '<div style={{ paddingInline: 18, rowGap: 14, marginBlock: 22 }} />',
      output: null,
      errors: [
        { messageId: 'offScaleStyle' },
        { messageId: 'offScaleStyle' },
        { messageId: 'offScaleStyle' },
      ],
    },
    {
      code: '<div style={{ padding: 1 }} />',
      output: null,
      errors: [{ messageId: 'offScaleStyle' }],
    },
    {
      code: 'const s = StyleSheet.create({ row: { gap: 7 }, cell: { paddingHorizontal: 9 } })',
      output: 'const s = StyleSheet.create({ row: { gap: 8 }, cell: { paddingHorizontal: 8 } })',
      errors: [{ messageId: 'offScaleStyle' }, { messageId: 'offScaleStyle' }],
    },
    {
      code: '<div className="gap-[13px]" />',
      output: '<div className="gap-3" />',
      errors: [{ messageId: 'offScaleClass' }],
    },
    {
      code: '<div className="md:mt-[15px]" />',
      output: '<div className="md:mt-4" />',
      errors: [{ messageId: 'offScaleClass' }],
    },
    {
      code: '<div className="p-1.5 px-2.5 mt-0.5" />',
      output: null,
      errors: [
        { messageId: 'offScaleClass' },
        { messageId: 'offScaleClass' },
        { messageId: 'offScaleClass' },
      ],
    },
    {
      code: '<div className={cn("flex", "gap-[18px]")} />',
      output: null,
      errors: [{ messageId: 'offScaleClass' }],
    },
    {
      code: '<div className={`flex ${x} pt-[9px]`} />',
      output: null,
      errors: [{ messageId: 'offScaleClass' }],
    },
    {
      code: '<div style={{ top: 3 }} />',
      output: '<div style={{ top: 4 }} />',
      errors: [{ messageId: 'offScaleStyle' }],
    },
  ],
})

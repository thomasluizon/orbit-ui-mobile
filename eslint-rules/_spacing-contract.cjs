const fs = require('node:fs')
const path = require('node:path')
const definition = require('../packages/shared/src/theme/spacing.json')

const root = path.resolve(__dirname, '..')
const stylesheet = 'packages/shared/src/theme/spacing.css'
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

function renderSpacingCss() {
  const scale = Object.entries(definition.scale).map(([token, value]) => `  --orbit-space-${token.slice(1)}: ${value}px;`)
  const roles = Object.entries(definition.roles).map(([role, token]) => `  --padding-${kebab(role)}: var(--orbit-space-${token.slice(1)});`)
  const utilities = [
    ...Object.values(definition.scale).map((value) => `  --spacing-${value / 4}: var(--orbit-space-${value});`),
    ...Object.keys(definition.roles).map((role) => `  --spacing-${kebab(role)}: var(--padding-${kebab(role)});`),
  ]
  return `:root {\n${[...scale, ...roles].join('\n')}\n}\n\n@theme inline {\n${utilities.join('\n')}\n}\n`
}

function offScaleCss(source) {
  const findings = []
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of clean.matchAll(/(?:^|[;{\n])\s*((?:padding|margin)(?:-[\w-]+)?)\s*:\s*([^;}]+)/g)) {
    const value = match[2].replace(/var\(\s*--[\w-]+/g, 'var(')
    for (const literal of value.matchAll(/(?<![\w.-])(-?\d*\.?\d+)(px|rem|em|%|vw|vh|dvh)?(?![\w.-])/g)) {
      const amount = Number(literal[1])
      const unit = literal[2] ?? ''
      if (['%', 'vw', 'vh', 'dvh'].includes(unit)) continue
      const pixels = unit === 'rem' ? amount * 16 : amount
      if ((unit === 'em' && amount !== 0) || !Object.values(definition.scale).includes(Math.abs(pixels))) {
        findings.push(`${match[1]}: ${literal[0]}`)
      }
    }
  }
  return findings
}

function checkSpacing() {
  const failures = []
  if (fs.readFileSync(path.join(root, stylesheet), 'utf8') !== renderSpacingCss()) {
    failures.push(`${stylesheet}: regenerate with npm run spacing:generate -w @orbit/eslint-rules`)
  }
  for (const directory of ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib']) {
    for (const relative of fs.readdirSync(path.join(root, directory), { recursive: true })) {
      if (!relative.endsWith('.css')) continue
      const filename = path.join(directory, relative)
      for (const finding of offScaleCss(fs.readFileSync(path.join(root, filename), 'utf8'))) failures.push(`${filename}: ${finding}`)
    }
  }
  return failures
}

module.exports = { renderSpacingCss, offScaleCss, checkSpacing }

if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write('Usage: _spacing-contract.cjs [--write]\nRegenerate shared CSS with --write; otherwise check all source CSS. Exit 0 on success, 1 on violations, 2 on invalid input.\n')
  } else if (args.length === 1 && args[0] === '--write') {
    fs.writeFileSync(path.join(root, stylesheet), renderSpacingCss())
  } else if (args.length) {
    process.stderr.write('Unknown argument. Use --help.\n')
    process.exitCode = 2
  } else {
    const failures = checkSpacing()
    if (failures.length) process.stderr.write(`${failures.join('\n')}\nUse SPACING or a padding role; never add a violation baseline.\n`)
    process.exitCode = failures.length ? 1 : 0
  }
}

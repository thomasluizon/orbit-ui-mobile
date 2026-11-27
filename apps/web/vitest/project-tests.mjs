import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

function findTests(directory) {
  return readdirSync(directory).flatMap((name) => {
    const filename = join(directory, name)
    if (statSync(filename).isDirectory()) return findTests(filename)
    return /\.test\.tsx?$/.test(name) ? [filename] : []
  })
}

// A test that reads a file of apps/mobile or apps/desktop. Its Turbo inputs hold those apps, so it runs in the cross-app
// project and the other web projects keep a key that a mobile-only or desktop-only change leaves equal.
const crossAppSource = /\bapps\/(?:mobile|desktop)\b|\.\.\/(?:mobile|desktop)\/|\.\.\/\$\{platform\}\/|['"]apps['"],\s*platform\b/

/**
 * The test files of the chromium project (files that import the shared Chromium lifecycle) and of the cross-app project,
 * as paths relative to the web root with forward slashes. A file that belongs to both stays in the chromium project.
 */
export function findProjectTests(webRoot) {
  const sources = findTests(join(webRoot, '__tests__'))
    .map((filename) => ({ file: relative(webRoot, filename).split(sep).join('/'), source: readFileSync(filename, 'utf8') }))
    .sort((left, right) => left.file.localeCompare(right.file))
  const chromiumTests = sources
    .filter(({ source }) => /\bfrom\s+['"][^'"]*\/chromium['"]/.test(source))
    .map(({ file }) => file)
  const crossAppTests = sources
    .filter(({ file, source }) => !chromiumTests.includes(file) && crossAppSource.test(source))
    .map(({ file }) => file)
  return { chromiumTests, crossAppTests }
}

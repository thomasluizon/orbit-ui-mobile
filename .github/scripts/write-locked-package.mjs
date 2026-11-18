#!/usr/bin/env node
// Writes a package.json and a package-lock.json that hold one package of the root lockfile with every package that it
// needs, at the same locations, versions and checksums. npm ci in that directory then installs the package without a
// resolve and without the workspace tree.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

// The location that Node resolution gives a dependency of the package at a location: the nearest node_modules directory
// of that location or of a parent location that holds the name.
function dependencyLocation(packages, from, name) {
  for (let base = from; ; ) {
    if (packages[`${base}/node_modules/${name}`]) return `${base}/node_modules/${name}`
    const parent = base.lastIndexOf("/node_modules/")
    if (parent < 0) break
    base = base.slice(0, parent)
  }
  return packages[`node_modules/${name}`] ? `node_modules/${name}` : null
}

export function lockedPackage(lockfile, name) {
  const { packages } = lockfile
  const start = `node_modules/${name}`
  if (!packages?.[start]) throw new Error(`the root lockfile has no ${start}`)
  const kept = {}
  const pending = [start]
  while (pending.length > 0) {
    const location = pending.pop()
    if (kept[location]) continue
    const entry = packages[location]
    if (!entry.resolved || !entry.integrity) throw new Error(`${location} has no resolved archive with a checksum`)
    kept[location] = entry
    for (const [dependency, optional] of [
      ...Object.keys(entry.dependencies ?? {}).map((dependency) => [dependency, false]),
      ...Object.keys(entry.optionalDependencies ?? {}).map((dependency) => [dependency, true]),
    ]) {
      const found = dependencyLocation(packages, location, dependency)
      if (found) pending.push(found)
      else if (!optional) throw new Error(`${location} needs ${dependency}, which the root lockfile does not hold`)
    }
  }
  const manifest = { name: `locked-${name.replace(/[@/]/g, "-").replace(/^-/, "")}`, private: true, devDependencies: { [name]: packages[start].version } }
  const sorted = Object.fromEntries(Object.keys(kept).sort().map((location) => [location, kept[location]]))
  return {
    manifest,
    lockfile: { name: manifest.name, lockfileVersion: 3, requires: true, packages: { "": { name: manifest.name, devDependencies: manifest.devDependencies }, ...sorted } },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name, directory] = process.argv.slice(2)
  if (!name || !directory) {
    console.error("Usage: node .github/scripts/write-locked-package.mjs <package name> <directory>")
    process.exit(2)
  }
  const { manifest, lockfile } = lockedPackage(JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")), name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(directory, "package-lock.json"), `${JSON.stringify(lockfile, null, 2)}\n`)
  console.log(`${name}@${manifest.devDependencies[name]}: ${Object.keys(lockfile.packages).length - 1} locked packages in ${directory}`)
}

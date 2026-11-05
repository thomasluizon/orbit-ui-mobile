#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "@babel/parser"
import hermesParser from "hermes-parser"

const USAGE = `usage: check-android-bundle.mjs --map <Hermes source map> [--project <mobile directory>]

  Inspect the Android export's actual module inventory and original sources.
  Reject duplicate native package roots and native view names registered by different modules.
  Run expo export --platform android --source-maps first, without --no-bytecode.

  --map <path>      exported Android Hermes source map
  --project <path>  Metro project directory (defaults to apps/mobile)
  --help, -h        print usage and exit 0

exit codes: 0 unique native registrations, 1 duplicates, 2 invalid input or missing evidence`

function argumentsFor(argv) {
  const options = { project: resolve(dirname(fileURLToPath(import.meta.url)), "../apps/mobile") }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (!["--map", "--project"].includes(flag) || !argv[index + 1] || argv[index + 1].startsWith("-")) {
      throw new Error(`invalid argument: ${flag}\n${USAGE}`)
    }
    options[flag.slice(2)] = resolve(argv[++index])
  }
  if (!options.map) throw new Error(`--map is required\n${USAGE}`)
  return options
}

function nativePackage(sourcePath) {
  let directory = dirname(realpathSync(sourcePath))
  while (directory !== dirname(directory)) {
    const manifest = join(directory, "package.json")
    if (existsSync(manifest)) {
      const native = existsSync(join(directory, "expo-module.config.json")) ||
        ["android", "ios"].some((platform) => existsSync(join(directory, platform)) && statSync(join(directory, platform)).isDirectory())
      return native ? { name: JSON.parse(readFileSync(manifest, "utf8")).name, directory } : null
    }
    directory = dirname(directory)
  }
  return null
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return
  if (typeof node.type === "string") visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (["loc", "tokens", "comments"].includes(key)) continue
    if (Array.isArray(child)) child.forEach((entry) => walk(entry, visit))
    else if (child && typeof child === "object") walk(child, visit)
  }
}

function registrations(content, source) {
  if (!/requireNativeComponent|codegenNativeComponent|NativeComponentRegistry|ReactNativeViewConfigRegistry/.test(content)) return []
  let ast
  try {
    ast = /\.[cm]?tsx?$/.test(source)
      ? parse(content, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] })
      : hermesParser.parse(content, { babel: true, flow: "all", sourceType: "unambiguous" })
  }
  catch (error) { throw new Error(`${source}: ${error.message}`) }
  const functions = new Set(["requireNativeComponent", "codegenNativeComponent"])
  const registries = new Map([["NativeComponentRegistry", "get"], ["ReactNativeViewConfigRegistry", "register"]])
  walk(ast, (node) => {
    if (node.type !== "ImportDeclaration") return
    const path = node.source.value
    for (const specifier of node.specifiers) {
      if (/\/(?:requireNativeComponent|codegenNativeComponent)$/.test(path) ||
          (path === "react-native" && specifier.imported?.name === "requireNativeComponent")) functions.add(specifier.local.name)
      if (/\/NativeComponentRegistry$/.test(path)) registries.set(specifier.local.name, "get")
      if (/\/ReactNativeViewConfigRegistry$/.test(path)) registries.set(specifier.local.name, "register")
    }
  })
  const names = new Set()
  walk(ast, (node) => {
    if (node.type !== "CallExpression") return
    const callee = node.callee
    const registers = callee.type === "Identifier" ? functions.has(callee.name) :
      callee.type === "MemberExpression" && registries.get(callee.object.name) === callee.property.name
    if (registers && node.arguments[0]?.type === "StringLiteral") names.add(node.arguments[0].value)
  })
  return names
}

function addOwner(inventory, name, owner) {
  if (!name) throw new Error(`native package without a name: ${owner}`)
  const owners = inventory.get(name) ?? new Set()
  owners.add(owner)
  inventory.set(name, owners)
}

function resolveSources(source, content, project, repository) {
  const candidates = source.startsWith("/")
    ? [source, resolve(project, `.${source}`), resolve(repository, `.${source}`)]
    : [resolve(project, source)]
  return [...new Set(candidates.filter((path) => existsSync(path) && readFileSync(path, "utf8") === content).map((path) => realpathSync(path)))]
}

function inspect({ map: mapPath, project }) {
  const sourceMap = JSON.parse(readFileSync(mapPath, "utf8"))
  if (sourceMap.version !== 3 || !Array.isArray(sourceMap.sources) || sourceMap.sources.length === 0 ||
      !Array.isArray(sourceMap.sourcesContent) || sourceMap.sourcesContent.length !== sourceMap.sources.length) {
    throw new Error("expected a nonempty version 3 source map with sourcesContent")
  }
  const packages = new Map()
  const components = new Map()
  let repository = project
  while (!existsSync(join(repository, "package-lock.json")) && repository !== dirname(repository)) repository = dirname(repository)
  for (let index = 0; index < sourceMap.sources.length; index++) {
    const source = sourceMap.sources[index]
    const content = sourceMap.sourcesContent[index]
    if (typeof source !== "string" || typeof content !== "string") throw new Error("source map omitted original source content")
    if (source.includes("\0")) continue
    const sourcePaths = resolveSources(source, content, project, repository)
    if (sourcePaths.length === 0) {
      if (source.includes("node_modules/")) throw new Error(`cannot resolve bundled package source: ${source}`)
      continue
    }
    for (const sourcePath of sourcePaths) {
      const native = nativePackage(sourcePath)
      if (native) addOwner(packages, native.name, native.directory)
      if (![".js", ".jsx", ".ts", ".tsx"].includes(extname(source))) continue
      for (const name of registrations(content, source)) addOwner(components, name, sourcePath)
    }
  }
  if (packages.size === 0 || components.size === 0) throw new Error("source map contains no native packages or component registrations")
  const duplicates = []
  for (const [kind, inventory] of [["native package", packages], ["native component", components]]) {
    for (const [name, owners] of inventory) {
      if (owners.size > 1) duplicates.push(`${kind} ${name}:\n${[...owners].map((owner) => `  ${owner}`).join("\n")}`)
    }
  }
  if (duplicates.length) {
    console.error(duplicates.join("\n"))
    return 1
  }
  console.log(`Android bundle passed: ${packages.size} native packages, ${components.size} native components, one owner each.`)
  return 0
}

if (process.argv.includes("--help") || process.argv.includes("-h")) console.log(USAGE)
else {
  try { process.exitCode = inspect(argumentsFor(process.argv.slice(2))) }
  catch (error) { console.error(`check-android-bundle: ${error.message}`); process.exitCode = 2 }
}

import { lstatSync, statSync } from "node:fs"
import { resolve } from "node:path"

/**
 * libuv's `search_path` (deps/uv/src/win/process.c, read at Node v24.21.0) slices PATH this way: a
 * slice that opens with `"` or `'` runs to its matching quote, so it may hold a `;`, and one leading
 * and one trailing quote are dropped before the directory is searched.
 */
const windowsPathDirectories = (pathValue) => {
  const directories = []
  let start = 0
  while (start < pathValue.length) {
    const quote = pathValue[start] === "\"" || pathValue[start] === "'" ? pathValue[start] : null
    const closing = quote ? pathValue.indexOf(quote, start + 1) : start
    const separator = closing === -1 ? -1 : pathValue.indexOf(";", closing)
    const end = separator === -1 ? pathValue.length : separator
    let slice = pathValue.slice(start, end)
    if (slice.startsWith("\"") || slice.startsWith("'")) slice = slice.slice(1)
    if (slice.endsWith("\"") || slice.endsWith("'")) slice = slice.slice(0, -1)
    if (slice !== "") directories.push(slice)
    start = end + 1
  }
  return directories
}

/**
 * libuv accepts a candidate when `GetFileAttributesW` finds it and it is not a directory. A live
 * link is judged by its target, which carries the same type as the link. A DANGLING link is never
 * spawnable: libuv skips a dangling directory link, and a dangling file link that libuv would pick
 * cannot start either, so skipping it lets the search reach the documented shim diagnostic.
 */
const isSpawnableFile = (candidate) => {
  let link
  try {
    link = lstatSync(candidate)
  } catch {
    return false
  }
  if (!link.isSymbolicLink()) return !link.isDirectory()
  try {
    return !statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

export const resolveSpawnTarget = (command, {
  platform = process.platform,
  cwd = process.cwd(),
  pathValue = process.env.PATH ?? "",
  pathExt = process.env.PATHEXT ?? "",
  isFile = isSpawnableFile,
} = {}) => {
  const pathDirectories = platform === "win32" ? windowsPathDirectories(pathValue) : pathValue.split(":").filter(Boolean)
  const directories = /[\\/]/.test(command) ? [cwd] : [cwd, ...pathDirectories.map((directory) => resolve(cwd, directory))]
  const name = command.split(/[\\/:]/).at(-1)
  const dot = name.indexOf(".")
  const hasExtension = dot !== -1 && dot < name.length - 1
  const candidateName = (extension) => extension === "" ? command : `${command}${command.endsWith(".") ? "" : "."}${extension.replace(/^\./, "")}`
  const directExtensions = hasExtension ? ["", "com", "exe"] : ["com", "exe"]
  for (const directory of directories) {
    for (const extension of directExtensions) {
      const candidate = resolve(directory, candidateName(extension))
      if (isFile(candidate)) return candidate
    }
  }
  // libuv ignores PATHEXT for direct spawn. Search it only after every spawnable candidate
  // failed, so an earlier .cmd cannot hide a later .exe.
  if (!hasExtension) {
    for (const directory of directories) {
      for (const extension of pathExt.split(";").filter((value) => [".cmd", ".bat"].includes(value.toLowerCase()))) {
        const candidate = resolve(directory, candidateName(extension))
        if (isFile(candidate)) return candidate
      }
    }
  }
  return null
}

import { spawnSync } from "node:child_process"
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
 * .NET's File.GetAttributes reads the link's attributes on Windows, including the Directory bit.
 * See https://learn.microsoft.com/en-us/windows/win32/fileio/symbolic-link-effects-on-file-systems-functions
 */
const danglingLinkIsDirectoryOnWindows = (candidate) => {
  const script = "$ErrorActionPreference = 'Stop'; $attributes = [IO.File]::GetAttributes($env:ORBIT_SPAWN_LINK_PATH); if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) { 'directory' } else { 'file' }"
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, ORBIT_SPAWN_LINK_PATH: candidate },
    windowsHide: true,
    timeout: 5000,
  })
  const kind = result.stdout?.trim()
  if (result.error || result.status !== 0 || !["directory", "file"].includes(kind)) {
    throw new Error(`could not read Windows link attributes for ${candidate}: ${result.error?.message ?? result.stderr.trim()}`)
  }
  return kind === "directory"
}

/** libuv selects the first non-directory candidate, even when its link target is missing. */
const isSpawnableFile = (candidate, danglingLinkIsDirectory) => {
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
    return !danglingLinkIsDirectory(candidate)
  }
}

export const resolveSpawnTarget = (command, {
  platform = process.platform,
  cwd = process.cwd(),
  pathValue = process.env.PATH ?? "",
  pathExt = process.env.PATHEXT ?? "",
  isFile = isSpawnableFile,
  danglingLinkIsDirectory = danglingLinkIsDirectoryOnWindows,
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
      if (isFile(candidate, danglingLinkIsDirectory)) return candidate
    }
  }
  // libuv ignores PATHEXT for direct spawn. Search it only after every spawnable candidate
  // failed, so an earlier .cmd cannot hide a later .exe.
  if (!hasExtension) {
    for (const directory of directories) {
      for (const extension of pathExt.split(";").filter((value) => [".cmd", ".bat"].includes(value.toLowerCase()))) {
        const candidate = resolve(directory, candidateName(extension))
        if (isFile(candidate, danglingLinkIsDirectory)) return candidate
      }
    }
  }
  return null
}

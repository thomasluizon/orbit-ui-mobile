import { existsSync, lstatSync } from "node:fs"
import { resolve } from "node:path"

export const resolveSpawnTarget = (command, {
  platform = process.platform,
  cwd = process.cwd(),
  pathValue = process.env.PATH ?? "",
  pathExt = process.env.PATHEXT ?? "",
  isFile = (candidate) => existsSync(candidate) && lstatSync(candidate).isFile(),
} = {}) => {
  const directories = /[\\/]/.test(command) ? [cwd] : [cwd, ...pathValue.split(platform === "win32" ? ";" : ":").filter(Boolean).map((directory) => resolve(cwd, directory))]
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

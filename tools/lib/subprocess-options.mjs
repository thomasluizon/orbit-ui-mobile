import {
  execFile as nodeExecFile,
  execFileSync as nodeExecFileSync,
  spawn as nodeSpawn,
  spawnSync as nodeSpawnSync,
} from "node:child_process"
import { promisify } from "node:util"

/** Every console child stays out of the user's desktop on Windows. */
export const hiddenProcessOptions = (options = {}) => ({
  ...options,
  windowsHide: true,
})

export const spawnHidden = (file, args, options) =>
  nodeSpawn(file, args, hiddenProcessOptions(options))

export const spawnSyncHidden = (file, args, options) =>
  nodeSpawnSync(file, args, hiddenProcessOptions(options))

export const execFileSyncHidden = (file, args, options) =>
  nodeExecFileSync(file, args, hiddenProcessOptions(options))

export const execFileHidden = (file, args, options, callback) =>
  typeof options === "function"
    ? nodeExecFile(file, args, hiddenProcessOptions(), options)
    : nodeExecFile(file, args, hiddenProcessOptions(options), callback)

execFileHidden[promisify.custom] = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFileHidden(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })

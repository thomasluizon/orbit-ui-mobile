import { closeSync, fstatSync, openSync, readSync, createReadStream } from "node:fs"
import { createInterface } from "node:readline"

export const TRANSCRIPT_TAIL_BYTES = 4 * 1024 * 1024

const parseLine = (line) => {
  try { return JSON.parse(line) } catch { return null }
}

const contextOf = (record) => {
  if (record?.type !== "assistant") return null
  const usage = record.message?.usage
  const values = [usage?.input_tokens, usage?.cache_creation_input_tokens, usage?.cache_read_input_tokens]
  return values.every((value) => Number.isInteger(value) && value >= 0)
    ? values.reduce((sum, value) => sum + value, 0) : null
}

/** Read complete trailing records only; a partial first or final line proves nothing. */
export const readSessionContext = (transcriptPath) => {
  const descriptor = openSync(transcriptPath, "r")
  try {
    const size = fstatSync(descriptor).size
    const start = Math.max(0, size - TRANSCRIPT_TAIL_BYTES)
    const buffer = Buffer.alloc(size - start)
    const length = readSync(descriptor, buffer, 0, buffer.length, start)
    const lines = buffer.subarray(0, length).toString("utf8").split("\n")
    if (start > 0) lines.shift()
    for (let index = lines.length - 1; index >= 0; index--) {
      const tokens = contextOf(parseLine(lines[index]))
      if (tokens !== null) return tokens
    }
    throw new Error("no complete assistant usage in transcript tail")
  } finally {
    closeSync(descriptor)
  }
}

/** The relay tool may scan the whole session; the Stop hook never does. */
export const readSessionMetrics = async (transcriptPath) => {
  const calls = new Map()
  const compactions = []
  let startedAt = null
  const stream = createReadStream(transcriptPath, { encoding: "utf8" })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  stream.on("error", (error) => lines.close())
  for await (const line of lines) {
    const record = parseLine(line)
    if (!record) continue
    if (startedAt === null && typeof record.timestamp === "string") startedAt = record.timestamp
    const contextTokens = contextOf(record)
    if (contextTokens !== null && typeof record.message.id === "string") {
      calls.set(record.message.id, { contextTokens, model: record.message.model, timestamp: record.timestamp })
    }
    if (record.type === "system" && record.subtype === "compact_boundary") compactions.push(record.compactMetadata)
  }
  if (stream.errored) throw stream.errored
  const entries = [...calls.values()]
  const growthPerCall = entries.slice(1).map((entry, index) => entry.contextTokens - entries[index].contextTokens)
  return { startedAt, calls: entries.length, lastCall: entries.at(-1) ?? null, maximumContextTokens: Math.max(0, ...entries.map((entry) => entry.contextTokens)), growthPerCall, compactions }
}

#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { authenticatedGmail, MAILBOX } from "./lib/auto-work-google.mjs"
import { acknowledgeIntake, intakeSource, saveIntakeSource } from "./lib/auto-work-intake.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"

const USAGE = `usage: orbit-mail.mjs <--collect | --draft | --ack>
Read the Orbit mailbox or create a reply draft. There is no send operation.
--collect paginates all received mail, including spam and trash, then reads only unseen ids.
Pending messages are cached in run state; completed message ids are the durable high-water mark.
--draft stdin JSON: {id, text}; replies to that pending message using its headers and thread.
--ack stdin JSON: {id, classification, person, ticket?}; bugs and feature requests need a ticket URL.
A person needs a saved reply draft before acknowledgement. Classifications: bug, feature request,
question, billing, praise, spam, noise. Outputs pending messages, draft id or acknowledged id.
Tokens remain in Keychain and memory. No secret stdin or argv is accepted.
--help, -h print usage
exit codes: 0 success; 1 API, state or receipt failure; 2 invalid arguments or stdin`

export const mailHeader = (message, name) => message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? ""
const cleanHeader = (value) => value.replace(/[\r\n]+[ \t]+/g, " ")
const messageBodies = (part) => [part?.body?.data ? { mimeType: part.mimeType, text: Buffer.from(part.body.data, "base64url").toString("utf8") } : null,
  ...(part?.parts ?? []).flatMap(messageBodies)].filter(Boolean)

export const collectMail = async (client, repoRoot = REPO_ROOT) => {
  let current = intakeSource("gmail", repoRoot)
  let pageToken
  do {
    const page = await client.list({ q: "-in:sent -in:drafts", includeSpamTrash: "true", maxResults: "500", ...(pageToken ? { pageToken } : {}) })
    for (const entry of page.messages ?? []) {
      if (current.completed[entry.id] || current.pending[entry.id]) continue
      const message = await client.read(entry.id)
      if (typeof entry.id !== "string" || message.id !== entry.id || typeof message.threadId !== "string") throw new Error("Invalid Gmail message identity")
      const item = { id: message.id, threadId: message.threadId, internalDate: message.internalDate,
        from: mailHeader(message, "From"), replyTo: mailHeader(message, "Reply-To") || mailHeader(message, "From"),
        subject: mailHeader(message, "Subject"), messageId: mailHeader(message, "Message-ID"), references: mailHeader(message, "References"),
        bodies: messageBodies(message.payload), snippet: message.snippet }
      current = saveIntakeSource("gmail", { ...current, pending: { ...current.pending, [item.id]: item }, highWater: item.id }, repoRoot)
    }
    pageToken = page.nextPageToken
  } while (pageToken)
  return Object.values(current.pending)
}

export const draftReply = async (client, { id, text }, repoRoot = REPO_ROOT) => {
  const current = intakeSource("gmail", repoRoot)
  const item = current.pending[id]
  if (!item || typeof text !== "string" || !text.trim()) throw new Error("A pending message and reply text are required")
  if (item.draftId) return item.draftId
  const marker = `<auto-work.${Buffer.from(id).toString("hex")}@useorbit.org>`
  const existing = await client.listDrafts({ q: `rfc822msgid:${marker.slice(1, -1)}`, maxResults: "1" })
  let draftId = existing.drafts?.[0]?.id
  if (!draftId) {
    const headers = { From: MAILBOX, To: cleanHeader(item.replyTo), Subject: `=?UTF-8?B?${Buffer.from(item.subject).toString("base64")}?=`,
      "Message-ID": marker, "In-Reply-To": cleanHeader(item.messageId), References: cleanHeader(`${item.references} ${item.messageId}`),
      "MIME-Version": "1.0", "Content-Type": "text/plain; charset=UTF-8", "Content-Transfer-Encoding": "base64" }
    if (Object.values(headers).some((value) => /[\r\n]/.test(value))) throw new Error("Invalid reply header")
    const body = Buffer.from(text).toString("base64").match(/.{1,76}/g).join("\r\n")
    const raw = Buffer.from(Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\r\n") + "\r\n\r\n" + body).toString("base64url")
    const draft = await client.createDraft({ threadId: item.threadId, raw })
    draftId = draft.id
  }
  if (typeof draftId !== "string" || !draftId) throw new Error("Gmail did not return a draft id")
  saveIntakeSource("gmail", { ...current, pending: { ...current.pending, [id]: { ...item, draftId } } }, repoRoot)
  return draftId
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
  if (args.length !== 1 || !["--collect", "--draft", "--ack"].includes(args[0])) { console.error(USAGE); process.exit(2) }
  let input
  if (args[0] !== "--collect") {
    try { let body = ""; for await (const chunk of process.stdin) body += chunk; input = JSON.parse(body) } catch { console.error("Expected JSON on stdin"); process.exit(2) }
  }
  try {
    if (args[0] === "--ack") { acknowledgeIntake("gmail", input); console.log(JSON.stringify({ acknowledged: input.id })) }
    else {
      intakeSource("gmail")
      const client = await authenticatedGmail()
      console.log(JSON.stringify(args[0] === "--collect" ? await collectMail(client) : { draftId: await draftReply(client, input) }))
    }
  } catch (error) { console.error(error.message); process.exit(1) }
}

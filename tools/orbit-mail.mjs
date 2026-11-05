#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { authenticatedGmail, MAILBOX } from "./lib/auto-work-google.mjs"
import { acknowledgeIntake, intakeSource, replyDisposition, saveIntakeSource } from "./lib/auto-work-intake.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"

const USAGE = `usage: orbit-mail.mjs <--collect | --draft | --reply | --ack>
Read the Orbit mailbox, draft replies or send clear replies under the auto-work policy.
--collect paginates all received mail, including spam and trash, then reads only unseen ids.
Complete pending messages are cached; unreadable text parts are retried without losing reply receipts.
External text parts use Gmail attachments.get; incomplete messages can only receive drafts.
Completed message ids are the durable high-water mark.
--draft stdin JSON: {id, text}; replies to that pending message using its headers and thread.
--reply stdin JSON: {id, text, classification, person, clear, concerns, replyKind, ticket?, evidence?}.
Only clear thanks, ticketed known bugs and verified supported how-to replies can send.
Billing, refunds, complaints, account, data and unclear cases remain drafts.
--ack stdin JSON: {id, classification, person, ticket?}; bugs and feature requests need a ticket URL.
A person needs a saved reply draft before acknowledgement. Classifications: bug, feature request,
question, billing, praise, spam, noise. Outputs pending messages, reply ids or acknowledged id.
Tokens remain in Keychain and memory. No secret stdin or argv is accepted.
--help, -h print usage
exit codes: 0 success; 1 API, state or receipt failure; 2 invalid arguments or stdin`

export const mailHeader = (message, name) => message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? ""
const cleanHeader = (value) => value.replace(/[\r\n]+[ \t]+/g, " ")
const replyMarker = (id) => `<auto-work.${Buffer.from(id).toString("hex")}@useorbit.org>`
const messageBodies = async (client, messageId, part) => {
  const contents = { bodies: [], bodiesComplete: true }
  if (part?.mimeType?.startsWith("text/")) {
    const attachmentId = part.body?.attachmentId
    const identity = { mimeType: part.mimeType, ...(attachmentId ? { attachmentId } : {}) }
    try {
      const body = attachmentId ? await client.readAttachment(messageId, attachmentId) : part.body
      if (typeof body?.data !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(body.data)) throw new Error("Unreadable text body")
      const decoded = Buffer.from(body.data, "base64url")
      if (attachmentId && (!Number.isInteger(body.size) || body.size !== decoded.length)) throw new Error("Incomplete attachment body")
      contents.bodies.push({ ...identity, text: decoded.toString("utf8") })
    } catch {
      contents.bodiesComplete = false
      contents.bodies.push({ ...identity, unreadable: true })
    }
  }
  for (const child of part?.parts ?? []) {
    const nested = await messageBodies(client, messageId, child)
    contents.bodies.push(...nested.bodies)
    contents.bodiesComplete &&= nested.bodiesComplete
  }
  return contents
}

const replyMessage = (item, text) => {
  if (typeof text !== "string" || !text.trim()) throw new Error("Reply text is required")
  const headers = { From: MAILBOX, To: cleanHeader(item.replyTo), Subject: `=?UTF-8?B?${Buffer.from(item.subject).toString("base64")}?=`,
    "Message-ID": replyMarker(item.id), "In-Reply-To": cleanHeader(item.messageId), References: cleanHeader(`${item.references} ${item.messageId}`),
    "MIME-Version": "1.0", "Content-Type": "text/plain; charset=UTF-8", "Content-Transfer-Encoding": "base64" }
  if (Object.values(headers).some((value) => /[\r\n]/.test(value))) throw new Error("Invalid reply header")
  const body = Buffer.from(text).toString("base64").match(/.{1,76}/g).join("\r\n")
  return { threadId: item.threadId, raw: Buffer.from(Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\r\n") + "\r\n\r\n" + body).toString("base64url") }
}

export const collectMail = async (client, repoRoot = REPO_ROOT) => {
  let current = intakeSource("gmail", repoRoot)
  let pageToken
  do {
    const page = await client.list({ q: "-in:sent -in:drafts", includeSpamTrash: "true", maxResults: "500", ...(pageToken ? { pageToken } : {}) })
    for (const entry of page.messages ?? []) {
      if (current.completed[entry.id] || current.pending[entry.id]?.bodiesComplete === true) continue
      const message = await client.read(entry.id)
      if (typeof entry.id !== "string" || message.id !== entry.id || typeof message.threadId !== "string") throw new Error("Invalid Gmail message identity")
      const item = { ...current.pending[entry.id], id: message.id, threadId: message.threadId, internalDate: message.internalDate,
        from: mailHeader(message, "From"), replyTo: mailHeader(message, "Reply-To") || mailHeader(message, "From"),
        subject: mailHeader(message, "Subject"), messageId: mailHeader(message, "Message-ID"), references: mailHeader(message, "References"),
        ...await messageBodies(client, message.id, message.payload), snippet: message.snippet }
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
  const marker = replyMarker(id)
  const existing = await client.listDrafts({ q: `rfc822msgid:${marker.slice(1, -1)}`, maxResults: "1" })
  let draftId = existing.drafts?.[0]?.id
  if (!draftId) {
    const draft = await client.createDraft(replyMessage(item, text))
    draftId = draft.id
  }
  if (typeof draftId !== "string" || !draftId) throw new Error("Gmail did not return a draft id")
  saveIntakeSource("gmail", { ...current, pending: { ...current.pending, [id]: { ...item, draftId } } }, repoRoot)
  return draftId
}

export const replyToMail = async (client, receipt, repoRoot = REPO_ROOT) => {
  let current = intakeSource("gmail", repoRoot)
  let item = current.pending[receipt.id]
  if (!item) throw new Error("A pending message is required")
  const disposition = replyDisposition(receipt, item)
  if (disposition === "none") return { disposition }
  if (item.sentId) return { disposition: "sent", sentId: item.sentId }
  if (disposition === "draft") return { disposition, draftId: await draftReply(client, receipt, repoRoot) }
  const message = replyMessage(item, receipt.text)
  const sent = await client.list({ q: `in:sent rfc822msgid:${replyMarker(receipt.id).slice(1, -1)}`, maxResults: "1" })
  let sentId = sent.messages?.[0]?.id
  if (!sentId) {
    if (item.sendAttempted) throw new Error("Previous send is unconfirmed; retain the item for owner review instead of sending twice")
    const draftId = await draftReply(client, receipt, repoRoot)
    current = intakeSource("gmail", repoRoot)
    item = current.pending[receipt.id]
    saveIntakeSource("gmail", { ...current, pending: { ...current.pending, [receipt.id]: { ...item, sendAttempted: true, replyReceipt: receipt } } }, repoRoot)
    sentId = (await client.sendDraft(draftId, receipt, message)).id
  }
  if (typeof sentId !== "string" || !sentId) throw new Error("Gmail did not confirm the sent message")
  current = intakeSource("gmail", repoRoot)
  saveIntakeSource("gmail", { ...current, pending: { ...current.pending, [receipt.id]: { ...current.pending[receipt.id], sentId } } }, repoRoot)
  return { disposition: "sent", sentId }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
  if (args.length !== 1 || !["--collect", "--draft", "--reply", "--ack"].includes(args[0])) { console.error(USAGE); process.exit(2) }
  let input
  if (args[0] !== "--collect") {
    try { let body = ""; for await (const chunk of process.stdin) body += chunk; input = JSON.parse(body) } catch { console.error("Expected JSON on stdin"); process.exit(2) }
  }
  try {
    if (args[0] === "--ack") { acknowledgeIntake("gmail", input); console.log(JSON.stringify({ acknowledged: input.id })) }
    else {
      intakeSource("gmail")
      const client = await authenticatedGmail()
      console.log(JSON.stringify(args[0] === "--collect" ? await collectMail(client) : args[0] === "--reply" ? await replyToMail(client, input) : { draftId: await draftReply(client, input) }))
    }
  } catch (error) { console.error(error.message); process.exit(1) }
}

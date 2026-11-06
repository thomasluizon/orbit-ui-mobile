import { spawnSync } from "node:child_process"
import { replyDisposition } from "./auto-work-intake.mjs"

export const MAILBOX = "contact@useorbit.org"
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"]
const KEYCHAIN_SERVICE = "org.useorbit.auto-work.gmail"

export const readGmailCredential = (execute = spawnSync) => {
  const result = execute("/usr/bin/security", ["find-generic-password", "-a", MAILBOX, "-s", KEYCHAIN_SERVICE, "-w"], { encoding: "utf8" })
  if (result.status !== 0) throw new Error("Gmail Keychain credential unavailable; run authorize-orbit-mail.mjs")
  try {
    const credential = JSON.parse(Buffer.from(result.stdout.trim(), "base64").toString("utf8"))
    if (![credential.client_id, credential.client_secret, credential.refresh_token].every((value) => typeof value === "string" && value)) throw new Error()
    return credential
  } catch { throw new Error("Invalid Gmail Keychain credential") }
}

export const storeGmailCredential = (credential, execute = spawnSync) => {
  const encoded = Buffer.from(JSON.stringify(credential)).toString("base64")
  const result = execute("/usr/bin/security", ["-i"], { encoding: "utf8",
    input: `add-generic-password -U -a ${MAILBOX} -s ${KEYCHAIN_SERVICE} -w ${encoded}\n` })
  if (result.status !== 0) throw new Error("Could not store Gmail credential in Keychain")
  const confirmed = readGmailCredential(execute)
  if (["client_id", "client_secret", "refresh_token"].some((key) => confirmed[key] !== credential[key])) throw new Error("Keychain write was not confirmed")
}

export const googleToken = async (parameters, request = fetch) => {
  const response = await request("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Google token exchange failed (HTTP ${response.status}); reauthorize if revoked`)
  let token
  try { token = await response.json() } catch { throw new Error("Google token response is not valid JSON") }
  if (typeof token.access_token !== "string" || !token.access_token) throw new Error("Google token response has no access token")
  if (token.refresh_token !== undefined && (typeof token.refresh_token !== "string" || !token.refresh_token)) throw new Error("Google token response has an invalid refresh token")
  return token
}

/**
 * Gmail quota units per method and the per-user budget, from
 * https://developers.google.com/workspace/gmail/api/reference/quota (messages.get costs 60 with format full).
 */
const QUOTA_UNITS = Object.freeze({ profile: 1, list: 5, read: 60, readAttachment: 20, listDrafts: 5, createDraft: 10, sendDraft: 100 })
const UNITS_PER_MINUTE = 6_000
const QUOTA_WINDOW_MILLISECONDS = 60_000
/**
 * Rate-limit reasons and the exponential backoff from one second, from
 * https://developers.google.com/workspace/gmail/api/guides/handle-errors.
 */
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"])
const MAXIMUM_ATTEMPTS = 7
const systemPacing = Object.freeze({ now: () => Date.now(), sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), random: Math.random })

/** Spends quota units inside a sliding minute, so sequential reads stay under the per-user budget. */
const quotaPacer = ({ now, sleep }) => {
  const spent = []
  return async (units) => {
    for (;;) {
      while (spent.length && now() - spent[0].at >= QUOTA_WINDOW_MILLISECONDS) spent.shift()
      if (spent.reduce((total, entry) => total + entry.units, 0) + units <= UNITS_PER_MINUTE) break
      await sleep(spent[0].at + QUOTA_WINDOW_MILLISECONDS - now())
    }
    spent.push({ at: now(), units })
  }
}

const errorReason = async (response) => {
  try { return (await response.json()).error?.errors?.find((entry) => typeof entry?.reason === "string")?.reason ?? "" } catch { return "" }
}

/** Sending an existing draft requires a clear, authorized disposition. */
export const gmailClient = (accessToken, request = fetch, pacing = systemPacing) => {
  const spend = quotaPacer(pacing)
  const call = async (operation, method, path, parameters = {}, body) => {
    const allowed = method === "GET" && /^(profile|messages|messages\/[^/?]+(?:\/attachments\/[^/?]+)?|drafts)$/.test(path) || method === "POST" && ["drafts", "drafts/send"].includes(path)
    if (!allowed) throw new Error("Gmail operation is outside the reply client")
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/${MAILBOX}/${path}`)
    url.search = new URLSearchParams(parameters).toString()
    // A send is never repeated here: Gmail can accept a send before it reports the limit, and replyToMail owns send recovery.
    const attempts = operation === "sendDraft" ? 1 : MAXIMUM_ATTEMPTS
    for (let attempt = 1; ; attempt++) {
      await spend(QUOTA_UNITS[operation])
      const response = await request(url, { method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
      if (response.ok) return response.json()
      const reason = response.status === 403 || response.status === 429 ? await errorReason(response) : ""
      const failure = `Gmail ${method} failed (HTTP ${response.status}${reason ? ` ${reason}` : ""})`
      if (response.status !== 429 && !(response.status === 403 && RATE_LIMIT_REASONS.has(reason))) throw new Error(failure)
      if (attempt >= attempts) throw new Error(attempt > 1 ? `${failure} after ${attempt} attempts` : failure)
      await pacing.sleep(2 ** (attempt - 1) * 1_000 + Math.floor(pacing.random() * 1_000))
    }
  }
  return Object.freeze({
    profile: () => call("profile", "GET", "profile"),
    list: (parameters) => call("list", "GET", "messages", parameters),
    read: (id) => call("read", "GET", `messages/${encodeURIComponent(id)}`, { format: "full" }),
    readAttachment: (messageId, attachmentId) => call("readAttachment", "GET", `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`),
    listDrafts: (parameters) => call("listDrafts", "GET", "drafts", parameters),
    createDraft: (message) => call("createDraft", "POST", "drafts", {}, { message }),
    sendDraft: (id, receipt, message) => {
      if (replyDisposition(receipt) !== "send") throw new Error("This reply must remain a draft for the owner")
      if (typeof message?.raw !== "string" || !message.raw) throw new Error("An exact classified reply is required")
      return call("sendDraft", "POST", "drafts/send", {}, { id, message })
    },
  })
}

export const authenticatedGmail = async ({ read = readGmailCredential, store = storeGmailCredential, request = fetch } = {}) => {
  const credential = read()
  const token = await googleToken({ client_id: credential.client_id, client_secret: credential.client_secret,
    refresh_token: credential.refresh_token, grant_type: "refresh_token" }, request)
  const client = gmailClient(token.access_token, request)
  if ((await client.profile()).emailAddress?.toLowerCase() !== MAILBOX) throw new Error("OAuth account must be the Orbit mailbox")
  if (token.refresh_token && token.refresh_token !== credential.refresh_token) store({ ...credential, refresh_token: token.refresh_token })
  return client
}

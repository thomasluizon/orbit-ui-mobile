import { spawnSync } from "node:child_process"

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
  return token
}

/** Only these Gmail reads and draft creation can reach the network. */
export const gmailClient = (accessToken, request = fetch) => {
  const call = async (method, path, parameters = {}, body) => {
    const allowed = method === "GET" && /^(profile|messages|messages\/[^/?]+|drafts)$/.test(path) || method === "POST" && path === "drafts"
    if (!allowed) throw new Error("Gmail operation is outside the draft-only client")
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/${MAILBOX}/${path}`)
    url.search = new URLSearchParams(parameters).toString()
    const response = await request(url, { method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Gmail ${method} failed (HTTP ${response.status})`)
    return response.json()
  }
  return Object.freeze({
    profile: () => call("GET", "profile"),
    list: (parameters) => call("GET", "messages", parameters),
    read: (id) => call("GET", `messages/${encodeURIComponent(id)}`, { format: "full" }),
    listDrafts: (parameters) => call("GET", "drafts", parameters),
    createDraft: (message) => call("POST", "drafts", {}, { message }),
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

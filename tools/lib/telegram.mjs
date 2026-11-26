/**
 * One message to the owner's phone through the Telegram Bot API method `sendMessage`. It does not poll, so another program
 * that polls the same bot is not disturbed. The fields were confirmed on 2026-11-26 against
 * https://core.telegram.org/bots/api#sendmessage: a JSON `POST` with `chat_id`, `text` of 1 to 4096 characters and
 * `link_preview_options`, answered by `{ ok: true, result }` or by `{ ok: false, description }`.
 */

const TOKEN_ITEM = "telegram-bot-token"
const CHAT_ITEM = "telegram-chat-id"
const TIMEOUT_MS = 15 * 1000

export const MESSAGE_LIMIT = 4096

/**
 * Sends one message. `keychain` reads a Keychain item and gives null when it is missing. Never throws. Returns `sent`,
 * `unset` with the name of the missing item, or `failed` with a reason that never holds the bot token.
 */
export const sendTelegram = async (text, { keychain, fetch = globalThis.fetch }) => {
  const token = await keychain(TOKEN_ITEM)
  if (token === null) return { status: "unset", missing: TOKEN_ITEM }
  const chatId = await keychain(CHAT_ITEM)
  if (chatId === null) return { status: "unset", missing: CHAT_ITEM }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A cut can split an emoji, and a half emoji is no valid UTF-8.
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, MESSAGE_LIMIT).toWellFormed(), link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const answer = await response.json().catch(() => null)
    if (answer?.ok === true) return { status: "sent" }
    return { status: "failed", reason: `HTTP ${response.status}: ${answer?.description ?? "no description"}`.replaceAll(token, "<token>") }
  } catch (error) {
    return { status: "failed", reason: String(error.cause?.message ?? error.message).replaceAll(token, "<token>") }
  }
}

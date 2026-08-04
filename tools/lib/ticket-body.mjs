/**
 * Normalize ticket body bytes at the file and Linear boundary. Text files commonly carry a
 * terminal line separator while Linear descriptions commonly do not. Line ending conversion and
 * one terminal line separator is a transport detail; all other content, including trailing spaces on
 * meaningful lines, remains unchanged.
 */
export const normalizeTicketBody = (body) => {
  if (typeof body !== "string") throw new TypeError("ticket body must be a string")
  return body.replace(/\r\n?/g, "\n").replace(/\n$/, "")
}

import { generateKeyPairSync, verify } from "node:crypto"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { appStoreToken, importAppStoreReviews, readAppStoreReviews } from "../orbit-app-store-reviews.mjs"
import { acknowledgeIntake, intakeSource } from "../lib/auto-work-intake.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { T, root } from "./_harness.mjs"

export const cases = async () => {
  const schema = JSON.parse(readFileSync(new URL("./fixtures/auto-work-apple-schemas.json", import.meta.url), "utf8"))
  T("app store: schema confirms creation time and no modification field", schema.schemas.CustomerReview.properties.attributes.properties.createdDate.format === "date-time" && !Object.hasOwn(schema.schemas.CustomerReview.properties.attributes.properties, "lastModifiedDate"))
  const calls = []
  const request = async (url, options) => {
    calls.push({ url, options })
    const second = new URL(url).searchParams.has("cursor")
    return Response.json({ data: [{ type: "customerReviews", id: second ? "review-2" : "review-1", attributes: {
      rating: 5, title: "Great", body: "Thanks", reviewerNickname: "Reviewer", createdDate: "2026-01-01T00:00:00Z", territory: "USA",
    } }], links: { self: String(url), ...(second ? {} : { next: "/v1/apps/123/customerReviews?cursor=next" }) } })
  }
  const snapshot = await readAppStoreReviews("123", "token", request)
  T("app store: all customer review pages use GET", snapshot.reviews.length === 2 && calls.every(({ options }) => options.method === "GET"))
  const checkout = join(root, "app-store-intake")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "parent", sleep: true, autoWork: true, intake: { appStore: { waitingOn: "#1561" } } }, checkout)
  const items = importAppStoreReviews(snapshot, checkout)
  acknowledgeIntake("appStore", { id: items[0].id, classification: "praise", person: true, reply: "Thank you!" }, checkout)
  writeRunState({ sessionId: "child", sleep: true, relay: { from: "parent" } }, checkout)
  T("app store: relay resumes without rereading completed items", importAppStoreReviews(snapshot, checkout).length === 1 && intakeSource("appStore", checkout).completed[items[0].id].reply === "Thank you!")
  const updated = await readAppStoreReviews("123", "token", async (url, options) => {
    const response = await request(url, options)
    const page = await response.json()
    page.data[0].attributes.body = "Changed text"
    return Response.json(page)
  })
  T("app store: content changes create a new version without a modification field", updated.reviews[0].id !== snapshot.reviews[0].id)
  let rejected = false
  try { await readAppStoreReviews("123", "token", async () => Response.json({ data: [], links: { next: "https://example.org/steal" } })) } catch { rejected = true }
  T("app store: pagination cannot send credentials to another host", rejected)
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  const [header, claims, signature] = appStoreToken({ keyId: "key", issuerId: "issuer", privateKey }).split(".")
  T("app store: ES256 signature uses the required JWT encoding", verify("SHA256", Buffer.from(`${header}.${claims}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")))
  const payload = JSON.parse(Buffer.from(claims, "base64url"))
  T("app store: JWT is short-lived and scoped to App Store Connect", payload.aud === "appstoreconnect-v1" && payload.exp - payload.iat === 600)
}

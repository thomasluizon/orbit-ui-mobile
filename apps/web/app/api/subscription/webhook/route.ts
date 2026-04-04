import { NextResponse, type NextRequest } from 'next/server'

/**
 * BFF: POST /api/subscription/webhook
 * Forwards Stripe webhook to .NET backend with raw body and signature header.
 * Does NOT use auth -- webhooks are unauthenticated.
 */
export async function POST(request: NextRequest) {
  const apiBase = process.env.API_BASE ?? 'http://localhost:5000'

  try {
    const rawBody = await request.text()
    const stripeSignature = request.headers.get('stripe-signature') ?? ''

    const response = await fetch(`${apiBase}/api/subscriptions/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': stripeSignature,
      },
      body: rawBody,
    })

    const data = await response.text()

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

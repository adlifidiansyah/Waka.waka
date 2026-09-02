import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settles an invoice when Stripe reports a completed checkout.
 *
 * The invoice is identified by `client_reference_id` (or metadata.invoice_id),
 * which the freelancer sets on the Payment Link. `settle_invoice` is idempotent,
 * so Stripe's redeliveries are harmless.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verification = verifyStripeSignature(
    rawBody,
    request.headers.get("stripe-signature"),
    process.env.STRIPE_WEBHOOK_SECRET,
  );

  if (!verification.valid) {
    console.warn("[stripe] rejected webhook:", verification.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data?.object ?? {};
  const metadata = (session.metadata ?? {}) as Record<string, string>;
  const invoiceId = (session.client_reference_id as string | undefined) ?? metadata.invoice_id;
  const paymentId = (session.payment_intent as string | undefined) ?? (session.id as string | undefined);

  if (!invoiceId) {
    console.warn("[stripe] checkout session has no invoice reference");
    return NextResponse.json({ received: true, ignored: "no invoice reference" });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("settle_invoice", {
    p_invoice_id: invoiceId,
    p_provider: "stripe",
    p_provider_payment_id: paymentId ?? null,
    p_actor_email: (session.customer_email as string | undefined) ?? null,
    p_actor_type: "system",
  });

  if (error) {
    console.error("[stripe] could not settle invoice", invoiceId, error.message);
    // 500 so Stripe retries a transient database failure.
    return NextResponse.json({ error: "Could not settle invoice" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMidtransSettled, verifyMidtransSignature } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Midtrans HTTP notification handler for the Indonesian market.
 *
 * The Payment Link's `order_id` is expected to be the ClientDeck invoice id, or
 * to carry it in `custom_field1`.
 */
export async function POST(request: NextRequest) {
  let payload: Record<string, string>;
  try {
    payload = (await request.json()) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const verification = verifyMidtransSignature(payload, process.env.MIDTRANS_SERVER_KEY);
  if (!verification.valid) {
    console.warn("[midtrans] rejected notification:", verification.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!isMidtransSettled(payload)) {
    return NextResponse.json({ received: true, ignored: payload.transaction_status });
  }

  const invoiceId = payload.custom_field1 || payload.order_id;
  if (!invoiceId) {
    return NextResponse.json({ received: true, ignored: "no invoice reference" });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("settle_invoice", {
    p_invoice_id: invoiceId,
    p_provider: "midtrans",
    p_provider_payment_id: payload.transaction_id ?? null,
    p_actor_email: null,
    p_actor_type: "system",
  });

  if (error) {
    console.error("[midtrans] could not settle invoice", invoiceId, error.message);
    return NextResponse.json({ error: "Could not settle invoice" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

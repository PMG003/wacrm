import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";

type Plan = "starter" | "pro";

const PRICE_IDS: Record<Plan, string | undefined> = {
  starter: process.env.STRIPE_PRICE_ID_STARTER,
  pro: process.env.STRIPE_PRICE_ID_PRO,
};

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { plan?: Plan };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { plan } = body;
  if (!plan || !PRICE_IDS[plan]) {
    return NextResponse.json(
      { error: "Invalid plan. Valid options: starter, pro" },
      { status: 400 }
    );
  }

  const priceId = PRICE_IDS[plan]!;
  const stripe = new Stripe(stripeKey);

  // Fetch org via admin client (bypasses RLS)
  const { data: member } = await supabaseAdmin()
    .from("organization_members")
    .select("organizations(id, name, stripe_customer_id)")
    .eq("user_id", user.id)
    .maybeSingle();

  const org = member?.organizations as unknown as {
    id: string;
    name: string;
    stripe_customer_id: string | null;
  } | null;

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Get or create Stripe customer
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org.name,
      metadata: { org_id: org.id, user_id: user.id },
    });
    customerId = customer.id;

    // Save customer ID immediately so we can match it in webhooks
    await supabaseAdmin()
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", org.id);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { org_id: org.id, plan },
    success_url: `${siteUrl}/settings?tab=billing&upgraded=1`,
    cancel_url: `${siteUrl}/settings?tab=billing`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { org_id: org.id, plan },
    },
  });

  return NextResponse.json({ url: session.url });
}

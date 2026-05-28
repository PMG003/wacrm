import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function POST() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey)
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabaseAdmin()
    .from("organization_members")
    .select("organizations(id, stripe_customer_id)")
    .eq("user_id", user.id)
    .maybeSingle();

  const org = member?.organizations as unknown as {
    id: string;
    stripe_customer_id: string | null;
  } | null;

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer found. Please subscribe first." },
      { status: 400 }
    );
  }

  const stripe = new Stripe(stripeKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${siteUrl}/settings?tab=billing`,
  });

  return NextResponse.json({ url: session.url });
}

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export const dynamic = "force-dynamic";

type Plan = "trial" | "starter" | "pro" | "enterprise";

const PRICE_TO_PLAN: Record<string, Plan> = {};

function getPriceToPlanMap(): Record<string, Plan> {
  if (process.env.STRIPE_PRICE_ID_STARTER)
    PRICE_TO_PLAN[process.env.STRIPE_PRICE_ID_STARTER] = "starter";
  if (process.env.STRIPE_PRICE_ID_PRO)
    PRICE_TO_PLAN[process.env.STRIPE_PRICE_ID_PRO] = "pro";
  return PRICE_TO_PLAN;
}

const PLAN_LIMITS: Record<Plan, { max_contacts: number; max_messages_per_month: number; max_agents: number; max_ai_suggestions_per_month: number }> = {
  trial:      { max_contacts: 500,   max_messages_per_month: 1_000,  max_agents: 3,   max_ai_suggestions_per_month: 50   },
  starter:    { max_contacts: 2_500, max_messages_per_month: 10_000, max_agents: 5,   max_ai_suggestions_per_month: 200  },
  pro:        { max_contacts: 15_000,max_messages_per_month: 50_000, max_agents: 20,  max_ai_suggestions_per_month: 1000 },
  enterprise: { max_contacts: 99999, max_messages_per_month: 999999, max_agents: 999, max_ai_suggestions_per_month: 9999 },
};

async function setOrgPlan(orgId: string, plan: Plan, subscriptionId: string, status: string) {
  const limits = PLAN_LIMITS[plan];
  const isActive = status === "active" || status === "trialing";

  await supabaseAdmin()
    .from("organizations")
    .update({
      plan,
      plan_status: isActive ? "active" : status === "canceled" ? "cancelled" : "inactive",
      stripe_subscription_id: subscriptionId,
      ...limits,
    })
    .eq("id", orgId);
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[billing/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const priceMap = getPriceToPlanMap();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const orgId = session.metadata?.org_id;
        if (!orgId) break;

        const subscriptionId = session.subscription as string;
        const plan = (session.metadata?.plan as Plan) ?? "starter";

        // Retrieve subscription to get its status
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await setOrgPlan(orgId, plan, subscriptionId, subscription.status);

        if (session.customer) {
          await supabaseAdmin()
            .from("organizations")
            .update({ stripe_customer_id: session.customer as string })
            .eq("id", orgId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.org_id;
        if (!orgId) break;

        const priceId = sub.items.data[0]?.price?.id;
        const plan: Plan = (priceId && priceMap[priceId]) ? priceMap[priceId] : "starter";

        await setOrgPlan(orgId, plan, sub.id, sub.status);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.org_id;
        if (!orgId) break;

        await supabaseAdmin()
          .from("organizations")
          .update({
            plan: "trial",
            plan_status: "cancelled",
            stripe_subscription_id: null,
            ...PLAN_LIMITS.trial,
          })
          .eq("id", orgId);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

"use client";

import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  Zap,
  Building2,
  Star,
} from "lucide-react";

type Plan = "trial" | "starter" | "pro" | "enterprise";

const PLAN_DETAILS: Record<Plan, {
  label: string;
  price: string;
  contacts: string;
  messages: string;
  agents: string;
  ai: string;
  icon: React.ReactNode;
  color: string;
}> = {
  trial: {
    label: "Trial",
    price: "Free · 14 days",
    contacts: "500",
    messages: "1,000 / mo",
    agents: "3",
    ai: "50 / mo",
    icon: <Zap className="h-5 w-5 text-amber-400" />,
    color: "border-amber-500/30 bg-amber-500/5",
  },
  starter: {
    label: "Starter",
    price: "$29 / mo",
    contacts: "2,500",
    messages: "10,000 / mo",
    agents: "5",
    ai: "200 / mo",
    icon: <Star className="h-5 w-5 text-blue-400" />,
    color: "border-blue-500/30 bg-blue-500/5",
  },
  pro: {
    label: "Pro",
    price: "$79 / mo",
    contacts: "15,000",
    messages: "50,000 / mo",
    agents: "20",
    ai: "1,000 / mo",
    icon: <Building2 className="h-5 w-5 text-violet-400" />,
    color: "border-violet-500/30 bg-violet-500/5",
  },
  enterprise: {
    label: "Enterprise",
    price: "Custom",
    contacts: "Unlimited",
    messages: "Unlimited",
    agents: "Unlimited",
    ai: "Unlimited",
    icon: <Building2 className="h-5 w-5 text-emerald-400" />,
    color: "border-emerald-500/30 bg-emerald-500/5",
  },
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function BillingSettings() {
  const { org, refreshOrg } = useOrg();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(plan: "starter" | "pro") {
    setLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Failed to start checkout");
      }
    } catch {
      alert("Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Failed to open billing portal");
      }
    } catch {
      alert("Failed to open billing portal");
    } finally {
      setLoading(null);
    }
  }

  if (!org) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const currentPlanDetails = PLAN_DETAILS[org.plan];
  const trialDays = daysUntil(org.trial_ends_at);
  const isPaid = org.plan !== "trial" && org.stripe_subscription_id;

  return (
    <div className="mt-4 space-y-6">
      {/* Current plan */}
      <Card
        className={`border ${currentPlanDetails.color} bg-slate-900`}
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            {currentPlanDetails.icon}
            <div>
              <CardTitle className="text-white">
                {currentPlanDetails.label} Plan
              </CardTitle>
              <CardDescription className="text-slate-400">
                {currentPlanDetails.price}
                {org.plan === "trial" && trialDays !== null && (
                  <span className="ml-2 font-medium text-amber-400">
                    · {trialDays} day{trialDays !== 1 ? "s" : ""} remaining
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Contacts", value: currentPlanDetails.contacts },
              { label: "Messages/mo", value: currentPlanDetails.messages },
              { label: "Agents", value: currentPlanDetails.agents },
              { label: "AI replies/mo", value: currentPlanDetails.ai },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-0.5 text-sm font-medium text-white">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {isPaid && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={handleManageBilling}
                disabled={loading === "portal"}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {loading === "portal" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Manage billing
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade options */}
      {(org.plan === "trial" || org.plan === "starter") && (
        <div>
          <h3 className="mb-4 text-sm font-medium text-slate-400">
            Upgrade your plan
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["starter", "pro"] as const)
              .filter((p) => p !== org.plan)
              .map((plan) => {
                const details = PLAN_DETAILS[plan];
                return (
                  <Card
                    key={plan}
                    className="border-slate-700 bg-slate-900"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        {details.icon}
                        <CardTitle className="text-base text-white">
                          {details.label}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-slate-400">
                        {details.price}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {[
                        `${details.contacts} contacts`,
                        `${details.messages} messages`,
                        `${details.agents} agents`,
                        `${details.ai} AI replies`,
                      ].map((feature) => (
                        <div
                          key={feature}
                          className="flex items-center gap-2 text-sm text-slate-300"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                          {feature}
                        </div>
                      ))}
                      <Button
                        onClick={() => handleUpgrade(plan)}
                        disabled={!!loading}
                        className="mt-3 w-full bg-violet-600 text-white hover:bg-violet-500"
                      >
                        {loading === plan ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Upgrade to {details.label}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600">
        Payments are processed securely by Stripe. By upgrading you agree to
        our terms of service. Cancel anytime from the billing portal.
      </p>
    </div>
  );
}

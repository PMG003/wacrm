"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Plan = "trial" | "starter" | "pro" | "enterprise";
type PlanStatus = "active" | "inactive" | "cancelled";
export type MemberRole = "owner" | "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  plan_status: PlanStatus;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  max_contacts: number;
  max_messages_per_month: number;
  max_ai_suggestions_per_month: number;
}

interface OrgContextValue {
  org: Organization | null;
  role: MemberRole | null;
  hasWhatsApp: boolean;
  loading: boolean;
  orgError: boolean;
  refreshOrg: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [hasWhatsApp, setHasWhatsApp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgError, setOrgError] = useState(false);

  const fetchOrg = useCallback(async (userId: string) => {
    const supabase = createClient();
    setLoading(true);
    setOrgError(false);
    try {
      const { data: member, error } = await supabase
        .from("organization_members")
        .select(
          "role, organizations(id, name, slug, plan, plan_status, trial_ends_at, stripe_customer_id, stripe_subscription_id, max_contacts, max_messages_per_month, max_ai_suggestions_per_month)"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[OrgProvider] member query error:", error.message);
        setOrgError(true);
      }

      if (member) {
        setOrg(member.organizations as unknown as Organization);
        setRole(member.role as MemberRole);
      } else {
        setOrg(null);
        setRole(null);
      }

      // Always check whatsapp_config independently — prevents redirect loop
      // when org query is slow or returns null.
      const { count } = await supabase
        .from("whatsapp_config")
        .select("id", { count: "exact", head: true });
      setHasWhatsApp((count ?? 0) > 0);
    } catch (err) {
      console.error("[OrgProvider] fetchOrg threw:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchOrg(user.id);
    } else {
      setOrg(null);
      setRole(null);
      setHasWhatsApp(false);
      setLoading(false);
    }
  }, [user, fetchOrg]);

  const refreshOrg = useCallback(async () => {
    if (user) await fetchOrg(user.id);
  }, [user, fetchOrg]);

  return (
    <OrgContext.Provider value={{ org, role, hasWhatsApp, loading, orgError, refreshOrg }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    return {
      org: null,
      role: null,
      hasWhatsApp: false,
      loading: false,
      orgError: false,
      refreshOrg: async () => {},
    };
  }
  return ctx;
}

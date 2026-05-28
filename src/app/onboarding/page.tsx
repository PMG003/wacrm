"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MessageSquare,
  Building2,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";

type Step = "workspace" | "whatsapp" | "done";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("workspace");
  const [authLoading, setAuthLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WhatsApp form state
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const init = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    // Check if WhatsApp is already configured
    const { count } = await supabase
      .from("whatsapp_config")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) > 0) {
      router.replace("/dashboard");
      return; // navigation is async — fall through to show page in case it's slow
    }

    // Fetch org
    const { data: member } = await supabase
      .from("organization_members")
      .select("organizations(id, name)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (member?.organizations) {
      const org = member.organizations as unknown as { id: string; name: string };
      setOrgId(org.id);
      setOrgName(org.name);
    }

    setAuthLoading(false); // always show the page so user isn't stuck on spinner
  }, [supabase, router]);

  useEffect(() => {
    init();
  }, [init]);

  async function handleSaveWorkspace() {
    if (!orgName.trim()) {
      setError("Workspace name is required");
      return;
    }
    if (!orgId) return;

    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from("organizations")
        .update({ name: orgName.trim() })
        .eq("id", orgId);

      if (updateErr) throw new Error(updateErr.message);
      setStep("whatsapp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWhatsApp() {
    if (!phoneNumberId.trim()) {
      setError("Phone Number ID is required");
      return;
    }
    if (!accessToken.trim()) {
      setError("Access Token is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          waba_id: wabaId.trim() || null,
          access_token: accessToken.trim(),
          verify_token: verifyToken.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setStep("done");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500">
          <MessageSquare className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-white">WA CRM</span>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-3">
        {(["workspace", "whatsapp"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                step === s
                  ? "bg-violet-600 text-white"
                  : step === "done" ||
                      (s === "workspace" && step === "whatsapp")
                    ? "bg-violet-500/20 text-violet-400"
                    : "bg-slate-800 text-slate-500"
              }`}
            >
              {step === "done" ||
              (s === "workspace" && step === "whatsapp") ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-sm ${step === s ? "text-white" : "text-slate-500"}`}
            >
              {s === "workspace" ? "Workspace" : "WhatsApp"}
            </span>
            {i < 1 && <div className="h-px w-8 bg-slate-700" />}
          </div>
        ))}
      </div>

      {/* Step: Workspace */}
      {step === "workspace" && (
        <Card className="w-full max-w-md border-slate-800 bg-slate-900">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
              <Building2 className="h-6 w-6 text-violet-500" />
            </div>
            <CardTitle className="text-xl text-white">
              Name your workspace
            </CardTitle>
            <CardDescription className="text-slate-400">
              This is how your team will identify this account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label className="text-slate-300">Workspace name</Label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveWorkspace()}
                placeholder="e.g. Acme Support Team"
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
              />
            </div>
            <Button
              onClick={handleSaveWorkspace}
              disabled={saving || !orgName.trim()}
              className="w-full bg-violet-600 text-white hover:bg-violet-500"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: WhatsApp */}
      {step === "whatsapp" && (
        <Card className="w-full max-w-md border-slate-800 bg-slate-900">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
              <MessageSquare className="h-6 w-6 text-violet-500" />
            </div>
            <CardTitle className="text-xl text-white">
              Connect WhatsApp
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enter your Meta WhatsApp Business API credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label className="text-slate-300">
                Phone Number ID{" "}
                <span className="text-red-400">*</span>
              </Label>
              <Input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 100234567890123"
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-slate-300">
                WhatsApp Business Account ID
              </Label>
              <Input
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="e.g. 100234567890456"
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-slate-300">
                Permanent Access Token{" "}
                <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Enter your access token"
                  className="border-slate-700 bg-slate-800 pr-10 text-white placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-slate-300">Webhook Verify Token</Label>
              <Input
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Create a custom verify token"
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">
                A string you choose — must match what you set in Meta webhook
                settings. You can update this later in Settings.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setStep("workspace")}
                className="text-slate-400 hover:text-white"
              >
                Back
              </Button>
              <Button
                onClick={handleSaveWhatsApp}
                disabled={saving || !phoneNumberId.trim() || !accessToken.trim()}
                className="flex-1 bg-violet-600 text-white hover:bg-violet-500"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Connect & finish"
                )}
              </Button>
            </div>

            <p className="text-center text-xs text-slate-500">
              You can skip this and set it up later in{" "}
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="text-violet-400 hover:text-violet-300"
              >
                Settings → WhatsApp
              </button>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/10">
            <CheckCircle2 className="h-10 w-10 text-violet-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            You&apos;re all set!
          </h2>
          <p className="text-slate-400">Redirecting to your dashboard...</p>
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
        </div>
      )}
    </div>
  );
}

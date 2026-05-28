import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { conversation_id } = body;
  if (!conversation_id)
    return NextResponse.json(
      { error: "conversation_id required" },
      { status: 400 }
    );

  // Fetch org to check plan limits
  const { data: member } = await supabase
    .from("organization_members")
    .select(
      "organizations(id, max_ai_suggestions_per_month)"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const orgData = member?.organizations as unknown as
    | { id: string; max_ai_suggestions_per_month: number }
    | null;

  // Check monthly usage limit by counting this org's suggestions this month
  if (orgData) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: monthCount } = await supabase
      .from("ai_suggestions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString());

    const limit = orgData.max_ai_suggestions_per_month ?? 100;
    if ((monthCount ?? 0) >= limit) {
      return NextResponse.json(
        {
          error: `Monthly AI suggestion limit (${limit}) reached. Upgrade your plan for more.`,
        },
        { status: 429 }
      );
    }
  }

  // Fetch recent messages for context (RLS scopes to org automatically)
  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("sender_type, content_text, created_at")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (msgError)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  if (!messages?.length)
    return NextResponse.json(
      { error: "No messages in conversation" },
      { status: 400 }
    );

  const reversed = [...messages].reverse();
  const conversationText = reversed
    .map((m) => {
      const label =
        m.sender_type === "customer"
          ? "Customer"
          : m.sender_type === "bot"
            ? "Bot"
            : "Agent";
      return `${label}: ${m.content_text ?? ""}`;
    })
    .join("\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI features not configured. Add ANTHROPIC_API_KEY to .env." },
      { status: 503 }
    );
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system:
      "You are a helpful customer support assistant for a WhatsApp business. Based on the conversation history provided, suggest a concise, professional reply for the agent to send next. Reply with ONLY the suggested message text — no explanation, no preamble, no quotes.",
    messages: [
      {
        role: "user",
        content: `Conversation history:\n\n${conversationText}\n\nSuggest a reply for the agent.`,
      },
    ],
  });

  const suggestion =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  // Save suggestion (trigger auto-sets org_id via set_org_id_from_auth)
  await supabase.from("ai_suggestions").insert({
    conversation_id,
    suggested_text: suggestion,
    context_snapshot: { messages: reversed.slice(-10) },
    created_by: user.id,
  });

  return NextResponse.json({ suggestion });
}

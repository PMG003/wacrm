import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAiReply } from "@/lib/automations/ai-provider";

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
    .select("organizations(id, max_ai_suggestions_per_month)")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgData = member?.organizations as unknown as
    | { id: string; max_ai_suggestions_per_month: number }
    | null;

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

  // Build messages for the AI provider (Groq/Ollama — no extra API key needed)
  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    {
      role: "system",
      content:
        "You are a helpful customer support assistant for a WhatsApp business. Based on the conversation history, suggest a concise, professional reply for the agent to send next. Reply with ONLY the suggested message text — no explanation, no preamble, no quotes.",
    },
    ...reversed.map((m) => ({
      role: (m.sender_type === "customer" ? "user" : "assistant") as "user" | "assistant",
      content: m.content_text ?? "",
    })).filter((m) => m.content),
  ]

  // Ensure last message is from user
  while (chatMessages.length > 1 && chatMessages[chatMessages.length - 1].role !== "user") {
    chatMessages.pop()
  }

  if (chatMessages.length < 2) {
    return NextResponse.json({ error: "No customer message to reply to" }, { status: 400 })
  }

  let suggestion: string
  try {
    suggestion = await generateAiReply(chatMessages, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `AI suggestion failed: ${msg}` }, { status: 503 })
  }

  // Save suggestion
  await supabase.from("ai_suggestions").insert({
    conversation_id,
    suggested_text: suggestion,
    context_snapshot: { messages: reversed.slice(-10) },
    created_by: user.id,
  });

  return NextResponse.json({ suggestion });
}

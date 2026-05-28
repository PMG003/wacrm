import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: conversationId } = await params;

  const { data, error } = await supabase
    .from("conversation_notes")
    .select("id, note_text, created_at, created_by")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: conversationId } = await params;
  const body = await req.json() as { note_text?: string };

  if (!body.note_text?.trim()) {
    return NextResponse.json({ error: "note_text is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversation_notes")
    .insert({ conversation_id: conversationId, note_text: body.note_text.trim(), created_by: user.id })
    .select("id, note_text, created_at, created_by")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: conversationId } = await params;
  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("note_id");

  if (!noteId) return NextResponse.json({ error: "note_id query param required" }, { status: 400 });

  const { error } = await supabase
    .from("conversation_notes")
    .delete()
    .eq("id", noteId)
    .eq("conversation_id", conversationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

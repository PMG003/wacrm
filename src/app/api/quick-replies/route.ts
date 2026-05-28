import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("quick_replies")
    .select("id, shortcut, title, message, created_at")
    .order("shortcut");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { shortcut?: string; title?: string; message?: string };
  const { shortcut, title, message } = body;

  if (!shortcut || !title || !message) {
    return NextResponse.json({ error: "shortcut, title, and message are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("quick_replies")
    .insert({ shortcut: shortcut.replace(/^\//, ""), title, message, created_by: user.id })
    .select("id, shortcut, title, message, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A quick reply with that shortcut already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

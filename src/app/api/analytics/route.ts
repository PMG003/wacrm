import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const range = parseInt(searchParams.get("range") ?? "30", 10);
  const validRange = [7, 30, 90].includes(range) ? range : 30;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - validRange);
  const since = sinceDate.toISOString();

  const [convRes, csatRes, membersRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, status, assigned_agent_id, created_at, first_response_at, resolved_at")
      .gte("created_at", since),
    supabase
      .from("csat_surveys")
      .select("rating, assigned_agent_id, responded_at")
      .not("rating", "is", null)
      .gte("sent_at", since),
    supabase
      .from("organization_members")
      .select("user_id, profiles(full_name, email)")
  ]);

  const conversations = (convRes.data ?? []) as Array<{
    id: string;
    status: string;
    assigned_agent_id: string | null;
    created_at: string;
    first_response_at: string | null;
    resolved_at: string | null;
  }>;

  const csatRows = (csatRes.data ?? []) as Array<{
    rating: number;
    assigned_agent_id: string | null;
    responded_at: string | null;
  }>;

  const members = (membersRes.data ?? []) as unknown as Array<{
    user_id: string;
    profiles: { full_name: string | null; email: string } | null;
  }>;

  // Build name lookup
  const agentNames = new Map<string, string>();
  for (const m of members) {
    const name = m.profiles?.full_name || m.profiles?.email || m.user_id;
    agentNames.set(m.user_id, name);
  }

  // Per-agent stats
  const agentMap = new Map<string, {
    id: string;
    name: string;
    conversations: number;
    resolved: number;
    avgFirstResponseMin: number | null;
    avgResolutionMin: number | null;
    csatSum: number;
    csatCount: number;
    _firstResponseMins: number[];
    _resolutionMins: number[];
  }>();

  const getAgent = (id: string) => {
    if (!agentMap.has(id)) {
      agentMap.set(id, {
        id,
        name: agentNames.get(id) ?? id,
        conversations: 0,
        resolved: 0,
        avgFirstResponseMin: null,
        avgResolutionMin: null,
        csatSum: 0,
        csatCount: 0,
        _firstResponseMins: [],
        _resolutionMins: [],
      });
    }
    return agentMap.get(id)!;
  };

  for (const c of conversations) {
    const agentId = c.assigned_agent_id;
    if (!agentId) continue;
    const a = getAgent(agentId);
    a.conversations += 1;
    if (c.status === "closed") a.resolved += 1;
    if (c.first_response_at) {
      const mins = (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 60_000;
      if (mins >= 0) a._firstResponseMins.push(mins);
    }
    if (c.resolved_at) {
      const mins = (new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 60_000;
      if (mins >= 0) a._resolutionMins.push(mins);
    }
  }

  for (const s of csatRows) {
    if (!s.assigned_agent_id || s.rating == null) continue;
    const a = getAgent(s.assigned_agent_id);
    a.csatSum += s.rating;
    a.csatCount += 1;
  }

  const avg = (arr: number[]) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

  const agents = Array.from(agentMap.values()).map((a) => ({
    id: a.id,
    name: a.name,
    conversations: a.conversations,
    resolved: a.resolved,
    avgFirstResponseMin: avg(a._firstResponseMins),
    avgResolutionMin: avg(a._resolutionMins),
    csatAvg: a.csatCount > 0 ? a.csatSum / a.csatCount : null,
    csatCount: a.csatCount,
  }));

  // Overall CSAT distribution
  const csatDist = [1, 2, 3, 4, 5].map((r) => ({
    rating: r,
    count: csatRows.filter((s) => s.rating === r).length,
  }));
  const allRatings = csatRows.map((s) => s.rating).filter(Boolean);
  const csatOverall = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : null;

  // Conversation volume by day
  const dayMap = new Map<string, number>();
  for (const c of conversations) {
    const day = c.created_at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const volumeByDay = Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, count]) => ({ day, count }));

  return NextResponse.json({
    rangeDays: validRange,
    agents,
    csatDistribution: csatDist,
    csatOverall,
    volumeByDay,
    totals: {
      conversations: conversations.length,
      resolved: conversations.filter((c) => c.status === "closed").length,
      csatResponses: allRatings.length,
    },
  });
}

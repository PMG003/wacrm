"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart2,
  Loader2,
  Star,
  Users,
  MessageSquare,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Range = 7 | 30 | 90;

interface AgentStat {
  id: string;
  name: string;
  conversations: number;
  resolved: number;
  avgFirstResponseMin: number | null;
  avgResolutionMin: number | null;
  csatAvg: number | null;
  csatCount: number;
}

interface CsatBucket {
  rating: number;
  count: number;
}

interface VolumePoint {
  day: string;
  count: number;
}

interface AnalyticsData {
  rangeDays: number;
  agents: AgentStat[];
  csatDistribution: CsatBucket[];
  csatOverall: number | null;
  volumeByDay: VolumePoint[];
  totals: {
    conversations: number;
    resolved: number;
    csatResponses: number;
  };
}

function fmtMin(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function StarRating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-500">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="text-sm text-white">{value.toFixed(1)}</span>
    </span>
  );
}

function MiniBarChart({ data }: { data: VolumePoint[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 600;
  const H = 80;
  const barW = Math.max(2, Math.floor((W / data.length) * 0.7));
  const gap = W / data.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = Math.max(2, (d.count / max) * (H - 8));
        const x = i * gap + (gap - barW) / 2;
        const y = H - barH;
        return (
          <rect
            key={d.day}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={2}
            className="fill-violet-500/60"
          />
        );
      })}
    </svg>
  );
}

function CsatBar({ dist }: { dist: CsatBucket[] }) {
  const total = dist.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="text-sm text-slate-500">No responses yet</p>;

  const COLORS = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-lime-500",
    "bg-emerald-500",
  ];
  return (
    <div className="space-y-2">
      {[5, 4, 3, 2, 1].map((r) => {
        const bucket = dist.find((d) => d.rating === r);
        const count = bucket?.count ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={r} className="flex items-center gap-2">
            <span className="w-4 text-right text-xs text-slate-400">{r}</span>
            <div className="flex-1 rounded-full bg-slate-800 h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${COLORS[r - 1]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-right text-xs text-slate-400">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${r}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">
            Agent performance, response times, and customer satisfaction.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
          {([7, 30, 90] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-violet-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        </div>
      ) : !data ? (
        <p className="text-center text-slate-500 py-20">Failed to load analytics.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Conversations",
                value: data.totals.conversations,
                icon: <MessageSquare className="h-4 w-4 text-violet-400" />,
              },
              {
                label: "Resolved",
                value: data.totals.resolved,
                icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
              },
              {
                label: "Resolution rate",
                value: data.totals.conversations
                  ? `${Math.round((data.totals.resolved / data.totals.conversations) * 100)}%`
                  : "—",
                icon: <TrendingUp className="h-4 w-4 text-blue-400" />,
              },
              {
                label: "CSAT responses",
                value: data.totals.csatResponses,
                icon: <Star className="h-4 w-4 text-amber-400" />,
              },
            ].map((c) => (
              <Card key={c.label} className="border-slate-700 bg-slate-900">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 text-slate-400">
                    {c.icon}
                    <span className="text-xs">{c.label}</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-white">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Volume chart + CSAT distribution */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-slate-700 bg-slate-900 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm text-white">Conversation volume</CardTitle>
                <CardDescription className="text-slate-400">
                  New conversations per day (last {range} days)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.volumeByDay.length === 0 ? (
                  <p className="text-sm text-slate-500">No data in this range.</p>
                ) : (
                  <MiniBarChart data={data.volumeByDay} />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-sm text-white">
                  CSAT distribution
                  {data.csatOverall !== null && (
                    <span className="ml-2 font-normal text-amber-400">
                      avg {data.csatOverall.toFixed(1)} ★
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {data.totals.csatResponses} customer ratings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CsatBar dist={data.csatDistribution} />
              </CardContent>
            </Card>
          </div>

          {/* Agent performance table */}
          <Card className="border-slate-700 bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-white">
                <Users className="h-4 w-4 text-violet-400" />
                Agent performance
              </CardTitle>
              <CardDescription className="text-slate-400">
                Assigned conversations only
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.agents.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No assigned conversations in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                        <th className="pb-2 pr-4 font-medium">Agent</th>
                        <th className="pb-2 pr-4 font-medium text-right">Conversations</th>
                        <th className="pb-2 pr-4 font-medium text-right">Resolved</th>
                        <th className="pb-2 pr-4 font-medium text-right">
                          <span className="flex items-center justify-end gap-1">
                            <Clock className="h-3 w-3" />
                            First response
                          </span>
                        </th>
                        <th className="pb-2 pr-4 font-medium text-right">
                          <span className="flex items-center justify-end gap-1">
                            <Clock className="h-3 w-3" />
                            Resolution
                          </span>
                        </th>
                        <th className="pb-2 font-medium text-right">CSAT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {data.agents.map((a) => (
                        <tr key={a.id}>
                          <td className="py-2.5 pr-4 font-medium text-white">{a.name}</td>
                          <td className="py-2.5 pr-4 text-right text-slate-300">
                            {a.conversations}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-300">
                            {a.resolved}
                            {a.conversations > 0 && (
                              <span className="ml-1 text-xs text-slate-500">
                                ({Math.round((a.resolved / a.conversations) * 100)}%)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-300">
                            {fmtMin(a.avgFirstResponseMin)}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-300">
                            {fmtMin(a.avgResolutionMin)}
                          </td>
                          <td className="py-2.5 text-right">
                            <StarRating value={a.csatAvg} />
                            {a.csatCount > 0 && (
                              <span className="ml-1 text-xs text-slate-500">
                                ({a.csatCount})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

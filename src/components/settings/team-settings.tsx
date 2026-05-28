"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  UserPlus,
  Loader2,
  Trash2,
  Crown,
  ShieldCheck,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Role = "owner" | "admin" | "member";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  profiles: { full_name: string | null; email: string } | null;
}

interface Invite {
  id: string;
  email: string;
  role: Role;
  expires_at: string;
  created_at: string;
}

const ROLE_ICONS: Record<Role, React.ReactNode> = {
  owner: <Crown className="h-3 w-3 text-amber-400" />,
  admin: <ShieldCheck className="h-3 w-3 text-violet-400" />,
  member: <User className="h-3 w-3 text-slate-400" />,
};

const ROLE_COLORS: Record<Role, string> = {
  owner: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  admin: "border-violet-500/20 bg-violet-500/10 text-violet-400",
  member: "border-slate-700 bg-slate-800 text-slate-400",
};

export function TeamSettings() {
  const supabase = createClient();
  const { user } = useAuth();
  const { org, role: myRole } = useOrg();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  const canManage = myRole === "owner" || myRole === "admin";

  const fetchTeam = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    try {
      const [{ data: membersData }, { data: invitesData }] = await Promise.all([
        supabase
          .from("organization_members")
          .select("id, user_id, role, profiles(full_name, email)")
          .eq("org_id", org.id)
          .order("created_at"),
        supabase
          .from("org_invites")
          .select("id, email, role, expires_at, created_at")
          .eq("org_id", org.id)
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }),
      ]);

      if (membersData) setMembers(membersData as unknown as Member[]);
      if (invitesData) setInvites(invitesData as unknown as Invite[]);
    } catch (err) {
      console.error("fetchTeam error:", err);
    } finally {
      setLoading(false);
    }
  }, [org, supabase]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  async function handleInvite() {
    if (!inviteEmail.trim() || !org) return;
    setInviting(true);
    try {
      const { error } = await supabase.from("org_invites").insert({
        org_id: org.id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invited_by: user!.id,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("An invite for this email already exists");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      fetchTeam();
    } catch (err) {
      toast.error("Failed to send invite");
      console.error(err);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string, targetUserId: string) {
    if (targetUserId === user?.id) {
      toast.error("You cannot remove yourself");
      return;
    }
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member removed");
    fetchTeam();
  }

  async function handleRevokeInvite(inviteId: string) {
    const { error } = await supabase
      .from("org_invites")
      .delete()
      .eq("id", inviteId);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invite revoked");
    fetchTeam();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Invite form — admins and owners only */}
      {canManage && (
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-white">Invite team member</CardTitle>
            <CardDescription className="text-slate-400">
              They will receive an invite link (you can share it manually for
              now).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-slate-300">Email address</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  placeholder="colleague@example.com"
                  className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-1.5 sm:w-36">
                <Label className="text-slate-300">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) =>
                    setInviteRole(v as "admin" | "member")
                  }
                >
                  <SelectTrigger className="border-slate-700 bg-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900 text-white">
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="bg-violet-600 text-white hover:bg-violet-500"
              >
                {inviting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Invite
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      <Card className="border-slate-700 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-white">
            Members{" "}
            <span className="text-sm font-normal text-slate-400">
              ({members.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-800/50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-sm font-medium text-violet-400">
                  {(m.profiles?.full_name ?? m.profiles?.email ?? "?")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {m.profiles?.full_name || m.profiles?.email || "Unknown"}
                  </p>
                  {m.profiles?.full_name && (
                    <p className="truncate text-xs text-slate-500">
                      {m.profiles.email}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[m.role]}`}
                >
                  {ROLE_ICONS[m.role]}
                  {m.role}
                </span>
                {canManage && m.role !== "owner" && m.user_id !== user?.id && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(m.id, m.user_id)}
                    className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400"
                    title="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-white">
              Pending invites{" "}
              <span className="text-sm font-normal text-slate-400">
                ({invites.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-300">
                      {inv.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      Expires{" "}
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    className={`text-xs ${ROLE_COLORS[inv.role as Role]}`}
                  >
                    {inv.role}
                  </Badge>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(inv.id)}
                      className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400"
                      title="Revoke invite"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Conversation, Message, Contact, ConversationStatus } from "@/types";
import {
  MessageSquare,
  ChevronDown,
  UserPlus,
  Clock,
  ArrowLeft,
  StickyNote,
} from "lucide-react";
import { format, isToday, isYesterday, differenceInHours } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { ConversationNotesPanel } from "./conversation-notes-panel";
import { toast } from "sonner";

interface OrgMember {
  user_id: string;
  name: string;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onBack?: () => void;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), "yyyy-MM-dd");
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: { label: string; value: ConversationStatus; color: string }[] = [
  { label: "Open", value: "open", color: "text-violet-400" },
  { label: "Pending", value: "pending", color: "text-amber-400" },
  { label: "Closed", value: "closed", color: "text-slate-400" },
];

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onBack,
}: MessageThreadProps) {
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(
    conversation?.assigned_agent_id ?? null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync assigned agent when conversation changes
  useEffect(() => {
    setAssignedAgentId(conversation?.assigned_agent_id ?? null);
    setShowNotes(false);
  }, [conversation?.id, conversation?.assigned_agent_id]);

  // Fetch org members for the assign dropdown
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("organization_members")
      .select("user_id, profiles(full_name, email)")
      .then(({ data }) => {
        if (!data) return;
        const list = (data as unknown as Array<{
          user_id: string;
          profiles: { full_name: string | null; email: string } | null;
        }>).map((m) => ({
          user_id: m.user_id,
          name: m.profiles?.full_name || m.profiles?.email || m.user_id,
        }));
        setMembers(list);
      });
  }, []);

  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: "" };

    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === "customer");

    if (!lastCustomerMsg) return { expired: true, remaining: "No customer messages" };

    const hoursSince = differenceInHours(new Date(), new Date(lastCustomerMsg.created_at));
    const expired = hoursSince >= 24;

    if (expired) return { expired: true, remaining: "Expired" };

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? `${Math.floor(hoursLeft)}h remaining`
        : `${Math.floor(hoursLeft * 60)}m remaining`;

    return { expired, remaining };
  }, [messages]);

  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch messages:", error);
      } else {
        onMessagesLoadedRef.current(data ?? []);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .then(({ error }) => {
        if (error) console.error("Failed to reset unread_count:", error);
      });
  }, [conversationId, hasUnread]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "text",
        content_text: text,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "text",
            content_text: text,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const supabase = createClient();
      const updates: Record<string, unknown> = { status };
      if (status === "closed") updates.resolved_at = new Date().toISOString();

      await supabase
        .from("conversations")
        .update(updates)
        .eq("id", conversation.id);

      // Create CSAT survey on close (ignore if one already exists)
      if (status === "closed") {
        await supabase.from("csat_surveys").upsert(
          {
            conversation_id: conversation.id,
            contact_id: contact?.id ?? null,
            assigned_agent_id: assignedAgentId,
          },
          { onConflict: "conversation_id", ignoreDuplicates: true }
        );
      }

      onStatusChange(conversation.id, status);
    },
    [conversation, contact, assignedAgentId, onStatusChange]
  );

  const handleAssign = useCallback(
    async (agentId: string | null) => {
      if (!conversation) return;

      const res = await fetch(`/api/conversations/${conversation.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });

      if (res.ok) {
        setAssignedAgentId(agentId);
        const name = agentId
          ? (members.find((m) => m.user_id === agentId)?.name ?? "agent")
          : "nobody";
        toast.success(agentId ? `Assigned to ${name}` : "Assignment cleared");
      } else {
        toast.error("Failed to assign conversation");
      }
    },
    [conversation, members]
  );

  const handleOpenTemplates = useCallback(() => {
    // Template modal implementation
  }, []);

  if (!conversation || !contact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-950">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
          <MessageSquare className="h-8 w-8 text-slate-600" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-slate-400">
          Select a conversation
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Choose a conversation from the left to start messaging
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const messageGroups = groupMessagesByDate(messages);
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === conversation.status);
  const assignedMember = members.find((m) => m.user_id === assignedAgentId);

  return (
    <div className="flex flex-1 flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{displayName}</h2>
            <p className="truncate text-xs text-slate-400">{contact.phone}</p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "ml-1 hidden gap-1 border-slate-700 text-[10px] sm:inline-flex sm:ml-2",
              sessionInfo.expired ? "text-red-400" : "text-violet-400"
            )}
          >
            <Clock className="h-3 w-3" />
            {sessionInfo.remaining}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          {/* Notes toggle */}
          <button
            type="button"
            onClick={() => setShowNotes((p) => !p)}
            title="Internal notes"
            className={cn(
              "flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors",
              showNotes
                ? "bg-amber-500/10 text-amber-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <StickyNote className="h-3 w-3" />
            <span className="hidden sm:inline">Notes</span>
          </button>

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-slate-800",
              currentStatus?.color ?? "text-slate-400"
            )}>
              {currentStatus?.label ?? "Status"}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-slate-700 bg-slate-800">
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn("text-sm", opt.color)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md text-slate-400 hover:bg-slate-800 hover:text-white">
              <UserPlus className="h-3 w-3" />
              <span className="hidden sm:inline max-w-[80px] truncate">
                {assignedMember?.name ?? "Assign"}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-slate-700 bg-slate-800 w-48">
              {members.map((m) => (
                <DropdownMenuItem
                  key={m.user_id}
                  onClick={() => handleAssign(m.user_id)}
                  className={cn(
                    "text-sm text-slate-200",
                    m.user_id === assignedAgentId && "text-violet-400"
                  )}
                >
                  {m.name}
                  {m.user_id === assignedAgentId && (
                    <span className="ml-auto text-[10px] text-violet-400">assigned</span>
                  )}
                </DropdownMenuItem>
              ))}
              {assignedAgentId && (
                <>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuItem
                    onClick={() => handleAssign(null)}
                    className="text-sm text-slate-500"
                  >
                    Clear assignment
                  </DropdownMenuItem>
                </>
              )}
              {members.length === 0 && (
                <DropdownMenuItem disabled className="text-xs text-slate-500">
                  No team members
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages + Notes */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-slate-500">No messages yet</p>
              <p className="text-xs text-slate-600">
                Send a template to start the conversation
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messageGroups.map((group) => (
                <div key={group.date}>
                  <div className="mb-4 flex items-center justify-center">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-[10px] font-medium text-slate-400">
                      {formatDateSeparator(group.date)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showNotes && (
          <div className="h-56 shrink-0">
            <ConversationNotesPanel conversationId={conversation.id} />
          </div>
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onOpenTemplates={handleOpenTemplates}
      />
    </div>
  );
}

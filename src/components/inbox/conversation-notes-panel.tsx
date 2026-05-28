"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Trash2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";

interface Note {
  id: string;
  note_text: string;
  created_at: string;
  created_by: string | null;
}

interface Props {
  conversationId: string;
}

export function ConversationNotesPanel({ conversationId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchNotes = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conversationId}/notes`);
    if (res.ok) {
      const data: Note[] = await res.json();
      setNotes(data);
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/conversations/${conversationId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_text: text.trim() }),
    });
    if (res.ok) {
      const note: Note = await res.json();
      setNotes((p) => [...p, note]);
      setText("");
    }
    setSubmitting(false);
  }

  async function handleDelete(noteId: string) {
    const res = await fetch(
      `/api/conversations/${conversationId}/notes?note_id=${noteId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setNotes((p) => p.filter((n) => n.id !== noteId));
    }
  }

  return (
    <div className="flex h-full flex-col border-t border-amber-500/20 bg-amber-500/5">
      <div className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-2">
        <StickyNote className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-medium text-amber-400">Internal notes</span>
        <span className="text-xs text-slate-500">(not visible to customer)</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-400 mx-auto mt-4" />
        ) : notes.length === 0 ? (
          <p className="text-center text-xs text-slate-500 mt-4">No notes yet</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="group relative rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-slate-200">{note.note_text}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
              </p>
              <button
                type="button"
                onClick={() => handleDelete(note.id)}
                className="absolute right-2 top-2 hidden rounded p-1 text-slate-500 hover:text-red-400 group-hover:flex"
                aria-label="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-amber-500/20 p-3 flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Add an internal note…"
          rows={2}
          className="resize-none flex-1 border-amber-500/30 bg-slate-900 text-sm text-white placeholder:text-slate-500 focus-visible:ring-amber-500/50"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || submitting}
          className="self-end bg-amber-500 hover:bg-amber-400 text-slate-900"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

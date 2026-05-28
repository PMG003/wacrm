"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Send, LayoutTemplate, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuickReplyPicker } from "./quick-reply-picker";

interface MessageComposerProps {
  conversationId: string;
  sessionExpired: boolean;
  onSend: (text: string) => void;
  onOpenTemplates: () => void;
}

export function MessageComposer({
  conversationId,
  sessionExpired,
  onSend,
  onOpenTemplates,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || sessionExpired) return;

    setSending(true);
    try {
      onSend(trimmed);
      setText("");
      setShowPicker(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showPicker && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape")) {
        // Let QuickReplyPicker handle these
        return;
      }
      if (showPicker && e.key === "Enter") {
        // Let QuickReplyPicker handle Enter to select
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, showPicker]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);
      adjustHeight();

      // Show picker when input is "/word" with nothing else
      const slashMatch = val.match(/^\/(\w*)$/);
      if (slashMatch) {
        setShowPicker(true);
        setPickerQuery(slashMatch[1]);
      } else {
        setShowPicker(false);
      }
    },
    [adjustHeight]
  );

  const handlePickerSelect = useCallback(
    (message: string) => {
      setText(message);
      setShowPicker(false);
      setTimeout(() => {
        adjustHeight();
        textareaRef.current?.focus();
      }, 0);
    },
    [adjustHeight]
  );

  const handleAiSuggest = useCallback(async () => {
    if (suggesting || sessionExpired) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const data = await res.json();
      if (res.ok && data.suggestion) {
        setText(data.suggestion);
        setTimeout(() => {
          adjustHeight();
          textareaRef.current?.focus();
        }, 0);
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setSuggesting(false);
    }
  }, [suggesting, sessionExpired, conversationId, adjustHeight]);

  return (
    <div className="border-t border-slate-800 bg-slate-900 p-3">
      {sessionExpired && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-400">
            24-hour session expired. Use a template to re-engage.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-400 hover:text-amber-300"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate className="mr-1 h-3 w-3" />
            Templates
          </Button>
        </div>
      )}

      <div className="relative flex items-end gap-2">
        {showPicker && (
          <QuickReplyPicker
            query={pickerQuery}
            onSelect={handlePickerSelect}
            onClose={() => setShowPicker(false)}
          />
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0 text-slate-400 hover:text-white"
          onClick={onOpenTemplates}
          title="Send template"
        >
          <LayoutTemplate className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0 text-slate-400 hover:text-violet-400 disabled:opacity-40"
          onClick={handleAiSuggest}
          disabled={suggesting || sessionExpired}
          title="AI reply suggestion"
        >
          {suggesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </Button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            sessionExpired
              ? "Session expired - use a template"
              : "Type '/' for quick replies…"
          }
          disabled={sessionExpired}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-violet-500/50",
            sessionExpired && "cursor-not-allowed opacity-50"
          )}
        />

        <Button
          size="sm"
          className="h-9 w-9 shrink-0 bg-violet-600 p-0 hover:bg-violet-500 disabled:opacity-40"
          disabled={!text.trim() || sessionExpired || sending}
          onClick={handleSend}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  message: string;
}

interface Props {
  query: string;           // text after the "/" trigger
  onSelect: (message: string) => void;
  onClose: () => void;
}

export function QuickReplyPicker({ query, onSelect, onClose }: Props) {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/quick-replies")
      .then((r) => r.json())
      .then((data: QuickReply[]) => {
        if (!cancelled) {
          setItems(data ?? []);
          setLoading(false);
          setActive(0);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = query
    ? items.filter(
        (r) =>
          r.shortcut.toLowerCase().includes(query.toLowerCase()) ||
          r.title.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((p) => Math.min(p + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((p) => Math.max(p - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        onSelect(filtered[active].message);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, active, onSelect, onClose]);

  if (loading) {
    return (
      <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
        <Loader2 className="h-4 w-4 animate-spin text-violet-500 mx-auto" />
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
        <p className="text-xs text-slate-500 text-center">No quick replies found</p>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 w-80 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
      <p className="px-3 pt-2 text-xs text-slate-500">Quick replies</p>
      <ul ref={listRef} className="max-h-52 overflow-y-auto py-1">
        {filtered.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(r.message); }}
              onMouseEnter={() => setActive(i)}
              className={`w-full px-3 py-2 text-left transition-colors ${
                i === active ? "bg-violet-500/10" : "hover:bg-slate-800"
              }`}
            >
              <span className="mr-2 font-mono text-xs text-violet-400">/{r.shortcut}</span>
              <span className="text-sm text-white">{r.title}</span>
              <p className="mt-0.5 truncate text-xs text-slate-400">{r.message}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

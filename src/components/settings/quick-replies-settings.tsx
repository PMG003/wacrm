"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  message: string;
}

export function QuickRepliesSettings() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formShortcut, setFormShortcut] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/quick-replies");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function startCreate() {
    setEditingId(null);
    setFormShortcut("");
    setFormTitle("");
    setFormMessage("");
    setShowForm(true);
  }

  function startEdit(item: QuickReply) {
    setEditingId(item.id);
    setFormShortcut(item.shortcut);
    setFormTitle(item.title);
    setFormMessage(item.message);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!formShortcut.trim() || !formTitle.trim() || !formMessage.trim()) {
      toast.error("All fields are required");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/quick-replies/${editingId}` : "/api/quick-replies";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortcut: formShortcut.trim().replace(/^\//, ""),
          title: formTitle.trim(),
          message: formMessage.trim(),
        }),
      });
      if (res.ok) {
        const saved: QuickReply = await res.json();
        if (editingId) {
          setItems((p) => p.map((i) => (i.id === editingId ? saved : i)));
          toast.success("Quick reply updated");
        } else {
          setItems((p) => [...p, saved]);
          toast.success("Quick reply created");
        }
        cancelForm();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((p) => p.filter((i) => i.id !== id));
      toast.success("Deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-white">Quick Replies</CardTitle>
          <CardDescription className="text-slate-400">
            Type <code className="text-violet-400">/shortcut</code> in the inbox composer to insert a reply.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={startCreate}
          className="bg-violet-600 text-white hover:bg-violet-500"
        >
          <Plus className="mr-1 h-4 w-4" />
          New
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
            <div className="flex gap-3">
              <div className="w-36">
                <label className="mb-1 block text-xs text-slate-400">Shortcut</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">/</span>
                  <Input
                    value={formShortcut}
                    onChange={(e) => setFormShortcut(e.target.value.replace(/^\//, "").replace(/\s/g, ""))}
                    placeholder="ty"
                    className="pl-6 border-slate-600 bg-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-violet-500"
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-400">Title</label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Thank you"
                  className="border-slate-600 bg-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-violet-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Message</label>
              <Textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Thank you for reaching out! We'll get back to you shortly."
                rows={3}
                className="resize-none border-slate-600 bg-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-violet-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={cancelForm} className="text-slate-400">
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-violet-600 text-white hover:bg-violet-500"
              >
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No quick replies yet. Create one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 shrink-0 font-mono text-sm text-violet-400">
                  /{item.shortcut}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{item.message}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

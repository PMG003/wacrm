'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type Tone = 'professional' | 'aggressive' | 'friendly';

interface AiConfig {
  agent_name: string;
  company_name: string;
  company_about: string;
  service_areas: string[];
  languages: string[];
  agent_tone: Tone;
  active_listings: string;
  custom_system_prompt: string;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'kn', label: 'Kannada' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ml', label: 'Malayalam' },
];

const TONES: { value: Tone; label: string; desc: string }[] = [
  { value: 'professional', label: 'Professional', desc: 'Balanced and trustworthy' },
  { value: 'aggressive', label: 'Aggressive Closer', desc: 'Push hard, close fast' },
  { value: 'friendly', label: 'Friendly Advisor', desc: 'Warm, consultative approach' },
];

const EMPTY: AiConfig = {
  agent_name: '',
  company_name: '',
  company_about: '',
  service_areas: [],
  languages: ['en'],
  agent_tone: 'professional',
  active_listings: '',
  custom_system_prompt: '',
};

export function AiAgentConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AiConfig>(EMPTY);
  const [newArea, setNewArea] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetch('/api/settings/ai-agent')
      .then(r => r.json())
      .then(({ config: c }) => {
        if (c) {
          setConfig({
            agent_name: c.agent_name ?? '',
            company_name: c.company_name ?? '',
            company_about: c.company_about ?? '',
            service_areas: c.service_areas ?? [],
            languages: c.languages ?? ['en'],
            agent_tone: c.agent_tone ?? 'professional',
            active_listings: c.active_listings ?? '',
            custom_system_prompt: c.custom_system_prompt ?? '',
          });
        }
      })
      .catch(() => toast.error('Failed to load AI config'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('AI agent configuration saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleLang = (code: string) => {
    setConfig(c => ({
      ...c,
      languages: c.languages.includes(code)
        ? c.languages.filter(l => l !== code)
        : [...c.languages, code],
    }));
  };

  const addArea = () => {
    const area = newArea.trim();
    if (!area || config.service_areas.includes(area)) return;
    setConfig(c => ({ ...c, service_areas: [...c.service_areas, area] }));
    setNewArea('');
  };

  const removeArea = (area: string) =>
    setConfig(c => ({ ...c, service_areas: c.service_areas.filter(a => a !== area) }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-8">
        <Loader2 className="size-4 animate-spin" /> Loading AI configuration…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Identity */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bot className="size-5 text-emerald-400" /> Agent Identity
          </CardTitle>
          <CardDescription className="text-slate-400">
            How your AI agent presents itself to leads on WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Agent Name</Label>
              <Input
                placeholder="e.g. Riya"
                value={config.agent_name}
                onChange={e => setConfig(c => ({ ...c, agent_name: e.target.value }))}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Company Name</Label>
              <Input
                placeholder="e.g. PMG Properties"
                value={config.company_name}
                onChange={e => setConfig(c => ({ ...c, company_name: e.target.value }))}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Company Description</Label>
            <textarea
              rows={3}
              placeholder="Brief description of your company, specialisation, and USPs…"
              value={config.company_about}
              onChange={e => setConfig(c => ({ ...c, company_about: e.target.value }))}
              className="w-full rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Agent Tone */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Agent Tone</CardTitle>
          <CardDescription className="text-slate-400">
            How aggressively the agent qualifies and closes leads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {TONES.map(t => (
              <button
                key={t.value}
                onClick={() => setConfig(c => ({ ...c, agent_tone: t.value }))}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  config.agent_tone === t.value
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="text-sm font-medium text-white">{t.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Service Areas */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Service Areas</CardTitle>
          <CardDescription className="text-slate-400">
            Localities and cities your company operates in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Salt Lake, New Town, Rajarhat"
              value={newArea}
              onChange={e => setNewArea(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addArea()}
              className="bg-slate-800 border-slate-600 text-white"
            />
            <Button variant="outline" onClick={addArea} className="border-slate-600 shrink-0">
              <Plus className="size-4" />
            </Button>
          </div>
          {config.service_areas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {config.service_areas.map(area => (
                <span
                  key={area}
                  className="flex items-center gap-1 rounded-full bg-slate-800 border border-slate-600 px-3 py-1 text-sm text-slate-300"
                >
                  {area}
                  <button onClick={() => removeArea(area)} className="text-slate-500 hover:text-red-400">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Languages */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Languages</CardTitle>
          <CardDescription className="text-slate-400">
            Languages your agent can respond in. The AI auto-detects the customer&apos;s language.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => toggleLang(l.code)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  config.languages.includes(l.code)
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Listings */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Active Property Listings</CardTitle>
          <CardDescription className="text-slate-400">
            Properties the AI can pitch to leads. Plain text — one property per block.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            rows={8}
            placeholder={`🏢 Martin Burn Business Park — Salt Lake Sector V\n  • Floor: 17th | Area: 3,030 sq ft | Rent: ₹43/sq ft\n  • Semi-Furnished | 3+3+3 year lease\n\n🏠 2BHK Flat — New Town Action Area II\n  • Area: 950 sqft | Price: ₹65L\n  • Ready to move | RERA registered`}
            value={config.active_listings}
            onChange={e => setConfig(c => ({ ...c, active_listings: e.target.value }))}
            className="w-full rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
          />
        </CardContent>
      </Card>

      {/* Advanced */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            {showAdvanced ? '▼' : '▶'} Advanced — Custom System Prompt
          </button>
          {showAdvanced && (
            <CardDescription className="text-slate-400 mt-1">
              Full prompt override. When set, this replaces everything above. Leave empty to use the generated prompt.
            </CardDescription>
          )}
        </CardHeader>
        {showAdvanced && (
          <CardContent>
            <textarea
              rows={12}
              placeholder="You are [name], a real estate agent at [company]…"
              value={config.custom_system_prompt}
              onChange={e => setConfig(c => ({ ...c, custom_system_prompt: e.target.value }))}
              className="w-full rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </CardContent>
        )}
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-32"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save AI Config'}
        </Button>
      </div>
    </div>
  );
}

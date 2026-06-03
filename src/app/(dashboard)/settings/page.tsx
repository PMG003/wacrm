'use client';

import { useState } from 'react';
import { Settings, MessageSquare, Tag, User, Palette, Bot } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { TagManager } from '@/components/settings/tag-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { AiAgentConfig } from '@/components/settings/ai-agent-config';

const TABS = [
  { value: 'profile',    label: 'Profile',        icon: User },
  { value: 'whatsapp',   label: 'WhatsApp Config', icon: Settings },
  { value: 'templates',  label: 'Templates',       icon: MessageSquare },
  { value: 'tags',       label: 'Tags',            icon: Tag },
  { value: 'appearance', label: 'Appearance',      icon: Palette },
  { value: 'ai-agent',   label: 'AI Agent',        icon: Bot },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabValue>('profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your profile, WhatsApp® integration, message templates, and tags.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList className="bg-slate-900 border border-slate-700">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearancePanel />
        </TabsContent>

        <TabsContent value="ai-agent">
          <AiAgentConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}

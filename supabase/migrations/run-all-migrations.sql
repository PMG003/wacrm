-- ============================================================
-- Combined migration script: 009 + 010 + 011
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS guards.
-- NOTE: org_id() lives in public schema (auth schema is restricted).
-- ============================================================

-- ============================================================
-- 009: Multi-tenancy
-- ============================================================

-- Create tables first (no cross-referencing policies yet)
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'trial'
                  CHECK (plan IN ('trial','starter','pro','enterprise')),
  plan_status   TEXT NOT NULL DEFAULT 'active'
                  CHECK (plan_status IN ('active','inactive','cancelled')),
  trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  max_contacts            INTEGER DEFAULT 500,
  max_messages_per_month  INTEGER DEFAULT 1000,
  max_agents              INTEGER DEFAULT 3,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS organization_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','member')),
  invited_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org  ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Helper: current user's org_id (public schema — auth schema is restricted)
CREATE OR REPLACE FUNCTION public.org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM organization_members
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- Now that both tables exist, create the cross-referencing policies
DROP POLICY IF EXISTS "Org members can view their org" ON organizations;
DROP POLICY IF EXISTS "Org owners can update their org" ON organizations;
CREATE POLICY "Org members can view their org" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );
CREATE POLICY "Org owners can update their org" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS "Members can view their org members" ON organization_members;
DROP POLICY IF EXISTS "Owners can manage members" ON organization_members;
CREATE POLICY "Members can view their org members" ON organization_members
  FOR SELECT USING (org_id = (
    SELECT org_id FROM organization_members om
    WHERE om.user_id = auth.uid() LIMIT 1
  ));
CREATE POLICY "Owners can manage members" ON organization_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
  );

CREATE TABLE IF NOT EXISTS org_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by  UUID NOT NULL REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, email)
);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org admins can manage invites" ON org_invites;
CREATE POLICY "Org admins can manage invites" ON org_invites
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_invites.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
  );

-- Add org_id to all data tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='org_id') THEN
    ALTER TABLE contacts ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(org_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tags' AND column_name='org_id') THEN
    ALTER TABLE tags ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='custom_fields' AND column_name='org_id') THEN
    ALTER TABLE custom_fields ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='org_id') THEN
    ALTER TABLE conversations ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(org_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='whatsapp_config' AND column_name='org_id') THEN
    ALTER TABLE whatsapp_config ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_whatsapp_config_org_id ON whatsapp_config(org_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='message_templates' AND column_name='org_id') THEN
    ALTER TABLE message_templates ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipelines' AND column_name='org_id') THEN
    ALTER TABLE pipelines ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='org_id') THEN
    ALTER TABLE deals ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='broadcasts' AND column_name='org_id') THEN
    ALTER TABLE broadcasts ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automations' AND column_name='org_id') THEN
    ALTER TABLE automations ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Migrate existing users → each gets their own org
DO $$
DECLARE
  r RECORD;
  v_org_id UUID;
  v_slug TEXT;
BEGIN
  FOR r IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = r.id) THEN
      CONTINUE;
    END IF;
    v_slug := lower(regexp_replace(split_part(r.email, '@', 1), '[^a-z0-9]', '-', 'g'));
    WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) LOOP
      v_slug := v_slug || '-' || floor(random() * 9000 + 1000)::TEXT;
    END LOOP;
    INSERT INTO organizations (name, slug, plan, trial_ends_at)
    VALUES (
      COALESCE(r.raw_user_meta_data->>'full_name', split_part(r.email, '@', 1), 'My Organization'),
      v_slug, 'trial', NOW() + INTERVAL '14 days'
    )
    RETURNING id INTO v_org_id;
    INSERT INTO organization_members (org_id, user_id, role) VALUES (v_org_id, r.id, 'owner');
    UPDATE contacts          SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE tags              SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE custom_fields     SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE conversations     SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE whatsapp_config   SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE message_templates SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE pipelines         SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE deals             SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE broadcasts        SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
    UPDATE automations       SET org_id = v_org_id WHERE user_id = r.id AND org_id IS NULL;
  END LOOP;
END $$;

-- Trigger function: auto-set org_id on INSERT
CREATE OR REPLACE FUNCTION set_org_id_from_auth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.org_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['contacts','tags','custom_fields','conversations','whatsapp_config','message_templates','pipelines','deals','broadcasts','automations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_org_id ON %I', tbl);
    EXECUTE format('CREATE TRIGGER set_org_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_org_id_from_auth()', tbl);
  END LOOP;
END $$;

-- RLS policies (all use public.org_id())
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;
DROP POLICY IF EXISTS "Org members can manage contacts" ON contacts;
CREATE POLICY "Org members can manage contacts" ON contacts FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage own tags" ON tags;
DROP POLICY IF EXISTS "Org members can manage tags" ON tags;
CREATE POLICY "Org members can manage tags" ON tags FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage contact tags" ON contact_tags;
DROP POLICY IF EXISTS "Org members can manage contact tags" ON contact_tags;
CREATE POLICY "Org members can manage contact tags" ON contact_tags
  FOR ALL USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_tags.contact_id AND contacts.org_id = public.org_id()));

DROP POLICY IF EXISTS "Users can manage own custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Org members can manage custom fields" ON custom_fields;
CREATE POLICY "Org members can manage custom fields" ON custom_fields FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage custom values" ON contact_custom_values;
DROP POLICY IF EXISTS "Org members can manage custom values" ON contact_custom_values;
CREATE POLICY "Org members can manage custom values" ON contact_custom_values
  FOR ALL USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_custom_values.contact_id AND contacts.org_id = public.org_id()));

DROP POLICY IF EXISTS "Users can manage own notes" ON contact_notes;
DROP POLICY IF EXISTS "Org members can manage notes" ON contact_notes;
CREATE POLICY "Org members can manage notes" ON contact_notes
  FOR ALL USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_notes.contact_id AND contacts.org_id = public.org_id()));

DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
DROP POLICY IF EXISTS "Org members can manage conversations" ON conversations;
CREATE POLICY "Org members can manage conversations" ON conversations FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Org members can view messages" ON messages;
CREATE POLICY "Org members can view messages" ON messages
  FOR ALL USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.org_id = public.org_id()));

DROP POLICY IF EXISTS "Users can manage own config" ON whatsapp_config;
DROP POLICY IF EXISTS "Org members can manage whatsapp config" ON whatsapp_config;
CREATE POLICY "Org members can manage whatsapp config" ON whatsapp_config FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage own templates" ON message_templates;
DROP POLICY IF EXISTS "Org members can manage templates" ON message_templates;
CREATE POLICY "Org members can manage templates" ON message_templates FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage own pipelines" ON pipelines;
DROP POLICY IF EXISTS "Org members can manage pipelines" ON pipelines;
CREATE POLICY "Org members can manage pipelines" ON pipelines FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage pipeline stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Org members can manage pipeline stages" ON pipeline_stages;
CREATE POLICY "Org members can manage pipeline stages" ON pipeline_stages
  FOR ALL USING (EXISTS (SELECT 1 FROM pipelines WHERE pipelines.id = pipeline_stages.pipeline_id AND pipelines.org_id = public.org_id()));

DROP POLICY IF EXISTS "Users can manage own deals" ON deals;
DROP POLICY IF EXISTS "Org members can manage deals" ON deals;
CREATE POLICY "Org members can manage deals" ON deals FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage own broadcasts" ON broadcasts;
DROP POLICY IF EXISTS "Org members can manage broadcasts" ON broadcasts;
CREATE POLICY "Org members can manage broadcasts" ON broadcasts FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage broadcast recipients" ON broadcast_recipients;
DROP POLICY IF EXISTS "Org members can manage broadcast recipients" ON broadcast_recipients;
CREATE POLICY "Org members can manage broadcast recipients" ON broadcast_recipients
  FOR ALL USING (EXISTS (SELECT 1 FROM broadcasts WHERE broadcasts.id = broadcast_recipients.broadcast_id AND broadcasts.org_id = public.org_id()));

DROP POLICY IF EXISTS "Users can manage own automations" ON automations;
DROP POLICY IF EXISTS "Org members can manage automations" ON automations;
CREATE POLICY "Org members can manage automations" ON automations FOR ALL USING (org_id = public.org_id());

DROP POLICY IF EXISTS "Users can manage automation steps" ON automation_steps;
DROP POLICY IF EXISTS "Org members can manage automation steps" ON automation_steps;
CREATE POLICY "Org members can manage automation steps" ON automation_steps
  FOR ALL USING (EXISTS (SELECT 1 FROM automations WHERE automations.id = automation_steps.automation_id AND automations.org_id = public.org_id()));

DROP POLICY IF EXISTS "Users can view automation logs" ON automation_logs;
DROP POLICY IF EXISTS "Org members can view automation logs" ON automation_logs;
CREATE POLICY "Org members can view automation logs" ON automation_logs
  FOR ALL USING (EXISTS (SELECT 1 FROM automations WHERE automations.id = automation_logs.automation_id AND automations.org_id = public.org_id()));

-- Update handle_new_user to auto-create org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_slug   TEXT;
  v_name   TEXT;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  v_name := COALESCE(NEW.raw_user_meta_data->>'org_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'My Organization');
  v_slug := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g'));
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) LOOP
    v_slug := v_slug || '-' || floor(random() * 9000 + 1000)::TEXT;
  END LOOP;

  INSERT INTO organizations (name, slug, plan, trial_ends_at)
  VALUES (v_name, v_slug, 'trial', NOW() + INTERVAL '14 days')
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (org_id, user_id, role) VALUES (v_org_id, NEW.id, 'owner');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON organizations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='organization_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE organization_members;
  END IF;
END $$;

-- ============================================================
-- 010: AI Suggestions
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  suggested_text   TEXT NOT NULL,
  context_snapshot JSONB,
  accepted         BOOLEAN DEFAULT FALSE,
  accepted_by      UUID REFERENCES auth.users(id),
  accepted_at      TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_conversation ON ai_suggestions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_org         ON ai_suggestions(org_id);

ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can manage ai suggestions" ON ai_suggestions;
CREATE POLICY "Org members can manage ai suggestions" ON ai_suggestions
  FOR ALL USING (org_id = public.org_id());

DROP TRIGGER IF EXISTS set_org_id ON ai_suggestions;
CREATE TRIGGER set_org_id BEFORE INSERT ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION set_org_id_from_auth();

CREATE TABLE IF NOT EXISTS ai_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month      DATE NOT NULL,
  requests   INTEGER DEFAULT 0,
  tokens_in  INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  UNIQUE(org_id, month)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_month ON ai_usage(org_id, month);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org admins can view ai usage" ON ai_usage;
CREATE POLICY "Org admins can view ai usage" ON ai_usage FOR SELECT USING (org_id = public.org_id());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='max_ai_suggestions_per_month') THEN
    ALTER TABLE organizations ADD COLUMN max_ai_suggestions_per_month INTEGER DEFAULT 100;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='ai_suggestions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_suggestions;
  END IF;
END $$;

-- ============================================================
-- 011: Inbox Productivity
-- ============================================================

CREATE TABLE IF NOT EXISTS quick_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shortcut      TEXT NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, shortcut)
);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members can read quick_replies" ON quick_replies;
DROP POLICY IF EXISTS "org members can insert quick_replies" ON quick_replies;
DROP POLICY IF EXISTS "org members can update quick_replies" ON quick_replies;
DROP POLICY IF EXISTS "org members can delete quick_replies" ON quick_replies;
CREATE POLICY "org members can read quick_replies"   ON quick_replies FOR SELECT USING (org_id = public.org_id());
CREATE POLICY "org members can insert quick_replies" ON quick_replies FOR INSERT WITH CHECK (org_id = public.org_id());
CREATE POLICY "org members can update quick_replies" ON quick_replies FOR UPDATE USING (org_id = public.org_id());
CREATE POLICY "org members can delete quick_replies" ON quick_replies FOR DELETE USING (org_id = public.org_id());

CREATE OR REPLACE FUNCTION set_quick_reply_org_id()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN NEW.org_id := public.org_id(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_quick_replies_org_id ON quick_replies;
CREATE TRIGGER trg_quick_replies_org_id BEFORE INSERT ON quick_replies FOR EACH ROW EXECUTE FUNCTION set_quick_reply_org_id();

CREATE TABLE IF NOT EXISTS conversation_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  note_text       TEXT NOT NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members can read conversation_notes" ON conversation_notes;
DROP POLICY IF EXISTS "org members can insert conversation_notes" ON conversation_notes;
DROP POLICY IF EXISTS "org members can delete own conversation_notes" ON conversation_notes;
CREATE POLICY "org members can read conversation_notes"       ON conversation_notes FOR SELECT USING (org_id = public.org_id());
CREATE POLICY "org members can insert conversation_notes"     ON conversation_notes FOR INSERT WITH CHECK (org_id = public.org_id());
CREATE POLICY "org members can delete own conversation_notes" ON conversation_notes FOR DELETE USING (org_id = public.org_id() AND created_by = auth.uid());

CREATE OR REPLACE FUNCTION set_conversation_note_org_id()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN NEW.org_id := public.org_id(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_conversation_notes_org_id ON conversation_notes;
CREATE TRIGGER trg_conversation_notes_org_id BEFORE INSERT ON conversation_notes FOR EACH ROW EXECUTE FUNCTION set_conversation_note_org_id();

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at        TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='assigned_agent_id') THEN
    ALTER TABLE conversations ADD COLUMN assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS csat_surveys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating            SMALLINT CHECK (rating BETWEEN 1 AND 5),
  feedback          TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at      TIMESTAMPTZ,
  UNIQUE (conversation_id)
);

ALTER TABLE csat_surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members can read csat_surveys" ON csat_surveys;
DROP POLICY IF EXISTS "org members can insert csat_surveys" ON csat_surveys;
DROP POLICY IF EXISTS "org members can update csat_surveys" ON csat_surveys;
CREATE POLICY "org members can read csat_surveys"   ON csat_surveys FOR SELECT USING (org_id = public.org_id());
CREATE POLICY "org members can insert csat_surveys" ON csat_surveys FOR INSERT WITH CHECK (org_id = public.org_id());
CREATE POLICY "org members can update csat_surveys" ON csat_surveys FOR UPDATE USING (org_id = public.org_id());

CREATE OR REPLACE FUNCTION set_csat_org_id()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN NEW.org_id := public.org_id(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_csat_surveys_org_id ON csat_surveys;
CREATE TRIGGER trg_csat_surveys_org_id BEFORE INSERT ON csat_surveys FOR EACH ROW EXECUTE FUNCTION set_csat_org_id();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='conversation_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_notes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='quick_replies') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quick_replies;
  END IF;
END $$;

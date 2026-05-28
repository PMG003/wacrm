-- ============================================================
-- AI Suggestions: store Claude-generated reply suggestions
-- Used by POST /api/ai/suggest to cache and display suggestions
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  suggested_text   TEXT NOT NULL,
  context_snapshot JSONB,          -- last N messages sent to Claude (for audit)
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

-- Auto-set org_id on insert
DROP TRIGGER IF EXISTS set_org_id ON ai_suggestions;
CREATE TRIGGER set_org_id BEFORE INSERT ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION set_org_id_from_auth();

-- ============================================================
-- AI usage tracking per org (for plan limits)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month      DATE NOT NULL,          -- first day of month e.g. 2026-05-01
  requests   INTEGER DEFAULT 0,
  tokens_in  INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  UNIQUE(org_id, month)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_month ON ai_usage(org_id, month);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org admins can view ai usage" ON ai_usage;
CREATE POLICY "Org admins can view ai usage" ON ai_usage
  FOR SELECT USING (org_id = public.org_id());

-- Add AI limits to organizations table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='max_ai_suggestions_per_month') THEN
    ALTER TABLE organizations ADD COLUMN max_ai_suggestions_per_month INTEGER DEFAULT 100;
  END IF;
END $$;

-- Realtime for ai_suggestions so inbox updates live
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ai_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_suggestions;
  END IF;
END $$;

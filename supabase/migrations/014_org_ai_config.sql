-- Migration 014: Per-tenant AI agent configuration
-- Each organisation configures their own AI agent persona, company info,
-- service areas, active listings, and optionally a full system prompt override.

CREATE TABLE IF NOT EXISTS org_ai_config (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_name           text        NOT NULL DEFAULT 'Riya',
  company_name         text        NOT NULL DEFAULT '',
  company_about        text,
  service_areas        text[],
  languages            text[]      DEFAULT '{en}',
  agent_tone           text        NOT NULL DEFAULT 'professional'
                                   CHECK (agent_tone IN ('professional', 'aggressive', 'friendly')),
  active_listings      text,       -- plain-text property listings injected into prompt
  custom_system_prompt text,       -- full override — replaces the generated prompt entirely
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (org_id)
);

ALTER TABLE org_ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read ai config"
  ON org_ai_config FOR SELECT
  USING (org_id = public.org_id());

CREATE POLICY "org members can upsert ai config"
  ON org_ai_config FOR INSERT
  WITH CHECK (org_id = public.org_id());

CREATE POLICY "org members can update ai config"
  ON org_ai_config FOR UPDATE
  USING (org_id = public.org_id())
  WITH CHECK (org_id = public.org_id());

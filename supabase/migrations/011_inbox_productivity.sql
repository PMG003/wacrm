-- ============================================================
-- 011: Inbox Productivity
-- quick_replies, conversation_notes, CSAT surveys,
-- and analytics columns on conversations
-- ============================================================

-- ── Quick replies ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shortcut      TEXT NOT NULL,           -- e.g. "ty" → triggers on /ty
  title         TEXT NOT NULL,           -- display label
  message       TEXT NOT NULL,           -- full reply text
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, shortcut)
);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read quick_replies"
  ON quick_replies FOR SELECT
  USING (org_id = public.org_id());

CREATE POLICY "org members can insert quick_replies"
  ON quick_replies FOR INSERT
  WITH CHECK (org_id = public.org_id());

CREATE POLICY "org members can update quick_replies"
  ON quick_replies FOR UPDATE
  USING (org_id = public.org_id());

CREATE POLICY "org members can delete quick_replies"
  ON quick_replies FOR DELETE
  USING (org_id = public.org_id());

CREATE OR REPLACE FUNCTION set_quick_reply_org_id()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.org_id := public.org_id();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quick_replies_org_id
  BEFORE INSERT ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION set_quick_reply_org_id();

-- ── Conversation notes (internal, not sent to customer) ───────
CREATE TABLE IF NOT EXISTS conversation_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  note_text       TEXT NOT NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read conversation_notes"
  ON conversation_notes FOR SELECT
  USING (org_id = public.org_id());

CREATE POLICY "org members can insert conversation_notes"
  ON conversation_notes FOR INSERT
  WITH CHECK (org_id = public.org_id());

CREATE POLICY "org members can delete own conversation_notes"
  ON conversation_notes FOR DELETE
  USING (org_id = public.org_id() AND created_by = auth.uid());

CREATE OR REPLACE FUNCTION set_conversation_note_org_id()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.org_id := public.org_id();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversation_notes_org_id
  BEFORE INSERT ON conversation_notes
  FOR EACH ROW EXECUTE FUNCTION set_conversation_note_org_id();

-- ── Analytics columns on conversations ───────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at        TIMESTAMPTZ;

-- ── CSAT surveys ─────────────────────────────────────────────
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
  UNIQUE (conversation_id)          -- one survey per conversation
);

ALTER TABLE csat_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read csat_surveys"
  ON csat_surveys FOR SELECT
  USING (org_id = public.org_id());

CREATE POLICY "org members can insert csat_surveys"
  ON csat_surveys FOR INSERT
  WITH CHECK (org_id = public.org_id());

CREATE POLICY "org members can update csat_surveys"
  ON csat_surveys FOR UPDATE
  USING (org_id = public.org_id());

CREATE OR REPLACE FUNCTION set_csat_org_id()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.org_id := public.org_id();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_csat_surveys_org_id
  BEFORE INSERT ON csat_surveys
  FOR EACH ROW EXECUTE FUNCTION set_csat_org_id();

-- ── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE quick_replies;

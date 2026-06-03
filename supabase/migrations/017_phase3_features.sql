-- ============================================================
-- Migration 017: Phase 3 features
--   1. webhook_token on whatsapp_config (IndiaMart/JustDial)
--   2. org_knowledge_base table (PDF knowledge base)
--   3. Storage bucket for knowledge base documents
-- ============================================================

-- 1. Webhook token for lead import
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS webhook_token text UNIQUE DEFAULT gen_random_uuid()::text;

-- Back-fill existing rows
UPDATE whatsapp_config
  SET webhook_token = gen_random_uuid()::text
  WHERE webhook_token IS NULL;

-- 2. Knowledge base documents table
CREATE TABLE IF NOT EXISTS org_knowledge_base (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename    text        NOT NULL,
  file_path   text        NOT NULL,
  file_type   text        NOT NULL DEFAULT 'pdf',
  content_text text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE org_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage knowledge base"
  ON org_knowledge_base FOR ALL
  USING (org_id = public.org_id());

-- 3. Storage bucket for knowledge base docs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-base',
  'knowledge-base',
  false,
  10485760,  -- 10 MB limit
  ARRAY['application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "org members can upload knowledge base docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'knowledge-base'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "org members can read knowledge base docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);

CREATE POLICY "org members can delete knowledge base docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);

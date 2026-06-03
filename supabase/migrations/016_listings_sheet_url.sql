-- Migration 016: Add Google Sheets URL for live property listings sync
ALTER TABLE org_ai_config
  ADD COLUMN IF NOT EXISTS listings_sheet_url text;

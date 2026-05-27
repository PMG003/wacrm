-- AI Lead Agent Automation
-- Handles every inbound message with Claude AI — qualifies leads, nurtures them,
-- and hands over to a human agent when the lead is ready.
--
-- BEFORE RUNNING:
--   1. Add ANTHROPIC_API_KEY to your .env / VPS environment
--   2. Deactivate old automations that fire on new_message_received or keyword_match
--      to avoid double-replies.
--
-- Run in Supabase SQL Editor → New query → Run

DO $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID;
  v_auto_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users
  WHERE email = 'upadhyaybasant@gmail.com' LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  SELECT org_id INTO v_org_id FROM organization_members
  WHERE user_id = v_user_id LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No org found for user'; END IF;

  -- Deactivate all other active automations to prevent double-replies
  UPDATE automations
  SET is_active = FALSE
  WHERE user_id = v_user_id AND is_active = TRUE;

  -- Create the AI Lead Agent automation
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (
    v_user_id, v_org_id,
    '🤖 AI Lead Agent',
    'Handles every inbound message with AI. Qualifies leads naturally, provides property info, and hands over to a human when the lead is ready.',
    'new_message_received',
    '{}'::jsonb,
    TRUE
  )
  RETURNING id INTO v_auto_id;

  -- Single ai_reply step — does everything
  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (
    v_auto_id,
    'ai_reply',
    '{
      "handover_message": "Let me connect you with our senior property advisor who will assist you personally. Our team will reach out to you shortly! 🙏",
      "max_history": 15
    }'::jsonb,
    0
  );

  RAISE NOTICE 'AI Lead Agent automation created for user %', v_user_id;
END $$;

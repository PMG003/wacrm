-- ============================================================
-- 015_gs_realty_automations.sql
-- Wipes all existing automations for the account and creates
-- the 5-automation GS Realty lead nurturing flow:
--   A1 — First Contact Greeting    (first_inbound_message)
--   A2 — Ongoing AI Qualification  (new_message_received)
--   A3 — Hot Lead Handover         (tag_added → hot-lead)
--   B1 — Warm Lead 30-day Nurture  (tag_added → warm-lead)
--   B2 — Cold Lead 60-day Drip     (tag_added → cold-lead)
-- ============================================================

DO $$
DECLARE
  v_user_id   UUID;
  v_auto_id   UUID;
  v_tag_hot   UUID;
  v_tag_warm  UUID;
  v_tag_cold  UUID;
BEGIN

  -- ── Find user ────────────────────────────────────────────
  SELECT id INTO v_user_id FROM auth.users
  WHERE email = 'upadhyaybasant@gmail.com' LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  -- ── Wipe existing automations & their steps/pending ──────
  DELETE FROM automation_pending_executions
  WHERE automation_id IN (SELECT id FROM automations WHERE user_id = v_user_id);

  DELETE FROM automation_steps
  WHERE automation_id IN (SELECT id FROM automations WHERE user_id = v_user_id);

  DELETE FROM automations WHERE user_id = v_user_id;

  -- ── Create / reuse tags ──────────────────────────────────
  INSERT INTO tags (user_id, name, color)
  VALUES (v_user_id, 'hot-lead', '#ef4444')
  ON CONFLICT DO NOTHING;

  INSERT INTO tags (user_id, name, color)
  VALUES (v_user_id, 'warm-lead', '#f59e0b')
  ON CONFLICT DO NOTHING;

  INSERT INTO tags (user_id, name, color)
  VALUES (v_user_id, 'cold-lead', '#3b82f6')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_tag_hot  FROM tags WHERE user_id = v_user_id AND name = 'hot-lead'  LIMIT 1;
  SELECT id INTO v_tag_warm FROM tags WHERE user_id = v_user_id AND name = 'warm-lead' LIMIT 1;
  SELECT id INTO v_tag_cold FROM tags WHERE user_id = v_user_id AND name = 'cold-lead' LIMIT 1;

  -- ════════════════════════════════════════════════════════
  -- A1 — First Contact Greeting
  -- Fires once when a new contact messages for the first time.
  -- Sends a warm human intro from Rahul, then AI takes over.
  -- ════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (
    v_user_id, v_org_id,
    '👋 A1 — First Contact',
    'Fires once on a brand-new contact. Rahul sends a human greeting then AI qualifies.',
    'first_inbound_message',
    '{}'::jsonb,
    TRUE
  ) RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position) VALUES
  (v_auto_id, 'send_message', '{"text": "Hey — thanks for reaching out to GS Realty. I''m Rahul, I handle property inquiries here. Quick question — are you looking at something commercial (office space) or residential (flat)?"}'::jsonb, 0),
  (v_auto_id, 'ai_reply',    '{"max_history": 50, "handover_message": "Let me get Gajendra Sir on this — he''ll personally reach out to you within 2 hours. Our team will be in touch shortly!"}'::jsonb, 1);

  -- ════════════════════════════════════════════════════════
  -- A2 — Ongoing AI Qualification
  -- Fires on every inbound message. AI qualifies, scores,
  -- handles objections, and triggers [[HANDOVER]] when ready.
  -- ════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (
    v_user_id, v_org_id,
    '🤖 A2 — AI Lead Agent',
    'Handles every inbound message with AI. Qualifies leads, nurtures them, and hands over to Gajendra when hot.',
    'new_message_received',
    '{}'::jsonb,
    TRUE
  ) RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position) VALUES
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Let me get Gajendra Sir on this — he''ll personally reach out to you within 2 hours. Our team will be in touch shortly!"}'::jsonb, 0);

  -- ════════════════════════════════════════════════════════
  -- A3 — Hot Lead Handover
  -- Fires when 'hot-lead' tag is added (by AI via [[HANDOVER]]
  -- or manually by Basant). Sends escalation message and assigns.
  -- ════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (
    v_user_id, v_org_id,
    '🔥 A3 — Hot Lead → Gajendra',
    'Immediately escalates hot leads to Gajendra with a confirmation message.',
    'tag_added',
    jsonb_build_object('tag_id', v_tag_hot::text),
    TRUE
  ) RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position) VALUES
  (v_auto_id, 'send_message',         '{"text": "Good news — Gajendra Sir will personally reach out to you within 2 hours with a shortlist that matches exactly what you need. Is this number the best one to call?"}'::jsonb, 0),
  (v_auto_id, 'assign_conversation',  jsonb_build_object('agent_id', v_user_id::text, 'mode', 'specific'), 1);

  -- ════════════════════════════════════════════════════════
  -- B1 — Warm Lead 30-Day Nurture
  -- Fires when 'warm-lead' tag is added.
  -- 5 AI-driven follow-ups over 30 days. AI reads the lead
  -- profile each time and adapts its angle automatically.
  -- ════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (
    v_user_id, v_org_id,
    '🌡️ B1 — Warm Lead Nurture (30 days)',
    'Sends 5 AI follow-ups over 30 days. AI adapts approach based on lead profile each time.',
    'tag_added',
    jsonb_build_object('tag_id', v_tag_warm::text),
    TRUE
  ) RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position) VALUES
  -- Day 1
  (v_auto_id, 'wait',     '{"amount": 1,  "unit": "days"}'::jsonb,                                        0),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 1),
  -- Day 4
  (v_auto_id, 'wait',     '{"amount": 3,  "unit": "days"}'::jsonb,                                        2),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 3),
  -- Day 8
  (v_auto_id, 'wait',     '{"amount": 4,  "unit": "days"}'::jsonb,                                        4),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 5),
  -- Day 15
  (v_auto_id, 'wait',     '{"amount": 7,  "unit": "days"}'::jsonb,                                        6),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 7),
  -- Day 29
  (v_auto_id, 'wait',     '{"amount": 14, "unit": "days"}'::jsonb,                                        8),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 9);

  -- ════════════════════════════════════════════════════════
  -- B2 — Cold Lead 60-Day Drip
  -- Fires when 'cold-lead' tag is added.
  -- 3 AI touches over 60 days — low pressure, value-led.
  -- ════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (
    v_user_id, v_org_id,
    '❄️ B2 — Cold Lead Drip (60 days)',
    'Low-pressure 3-touch sequence over 60 days for cold leads not ready to move yet.',
    'tag_added',
    jsonb_build_object('tag_id', v_tag_cold::text),
    TRUE
  ) RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position) VALUES
  -- Day 7
  (v_auto_id, 'wait',     '{"amount": 7,  "unit": "days"}'::jsonb,                                        0),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 1),
  -- Day 21
  (v_auto_id, 'wait',     '{"amount": 14, "unit": "days"}'::jsonb,                                        2),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 3),
  -- Day 42
  (v_auto_id, 'wait',     '{"amount": 21, "unit": "days"}'::jsonb,                                        4),
  (v_auto_id, 'ai_reply', '{"max_history": 50, "handover_message": "Connecting you with Gajendra Sir now!"}'::jsonb, 5);

  RAISE NOTICE 'GS Realty 5-automation flow created for user %', v_user_id;
  RAISE NOTICE 'Tags: hot-lead=%, warm-lead=%, cold-lead=%', v_tag_hot, v_tag_warm, v_tag_cold;

END $$;

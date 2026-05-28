-- Demo seed: PMG org + Basant contact + dummy WhatsApp config
-- Paste into Supabase SQL Editor → New query → Run

DO $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID;
BEGIN

  -- Look up user by email (auth.uid() is NULL in the SQL Editor)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'upadhyaybasant@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found — check the email address in this script';
  END IF;

  -- 1. Look for an existing org membership
  SELECT org_id INTO v_org_id
  FROM organization_members
  WHERE user_id = v_user_id
  LIMIT 1;

  -- 2. If none exists, create the org and add the user as owner
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (
      name, slug, plan, plan_status, trial_ends_at,
      max_contacts, max_messages_per_month, max_ai_suggestions_per_month
    )
    VALUES (
      'PMG', 'pmg', 'trial', 'active', NOW() + INTERVAL '14 days',
      5000, 10000, 1000
    )
    RETURNING id INTO v_org_id;

    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');
  ELSE
    UPDATE organizations SET name = 'PMG', slug = 'pmg' WHERE id = v_org_id;
  END IF;

  -- 3. Dummy WhatsApp config so hasWhatsApp = true (bypasses onboarding)
  INSERT INTO whatsapp_config (
    user_id, phone_number_id, waba_id, access_token,
    verify_token, status, connected_at
  )
  VALUES (
    v_user_id,
    '123456789012345',
    '987654321098765',
    'DUMMY_ACCESS_TOKEN_PMG',
    'pmg_verify_token',
    'connected',
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'connected', connected_at = NOW();

  -- 4. Contacts
  INSERT INTO contacts (user_id, name, phone, email, status)
  VALUES
    (v_user_id, 'Basant Sharma', '+919876543210', 'basant@pmg.com',   'active'),
    (v_user_id, 'Rahul Verma',   '+919811223344', 'rahul@example.com','active'),
    (v_user_id, 'Priya Singh',   '+919900112233', 'priya@example.com','active'),
    (v_user_id, 'Amit Kumar',    '+919733445566', 'amit@example.com', 'active'),
    (v_user_id, 'Sneha Patel',   '+919622334455', 'sneha@example.com','active')
  ON CONFLICT DO NOTHING;

  -- 5. Profile display name
  UPDATE profiles SET full_name = 'Basant Sharma' WHERE id = v_user_id;

  RAISE NOTICE 'Done — org: %, user: %', v_org_id, v_user_id;
END $$;

-- Real Estate Automation Pack — Nested/Branching Flows
-- Paste into Supabase SQL Editor → New query → Run
-- All automations are inserted as is_active = FALSE — enable them in the app.

DO $$
DECLARE
  v_user_id  UUID;
  v_org_id   UUID;
  v_auto_id  UUID;
  v_cond_id  UUID;   -- condition step whose branches we're attaching
  v_cond2_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users
  WHERE email = 'upadhyaybasant@gmail.com' LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  SELECT org_id INTO v_org_id FROM organization_members
  WHERE user_id = v_user_id LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No org found for user'; END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. SMART WELCOME + QUALIFIER (first_inbound_message)
  --    Branch A — lead says "urgent": immediate priority response
  --    Branch B — everyone else  : warm welcome → wait → qualification ask
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (v_user_id, v_org_id,
    '🏠 Smart Welcome + Qualifier',
    'Greets new leads. Routes urgent enquiries immediately; others get a warm welcome + qualification questions.',
    'first_inbound_message', '{}'::jsonb, FALSE)
  RETURNING id INTO v_auto_id;

  -- Root step 0: condition — is it urgent?
  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'condition',
    '{"subject":"message_content","value":"urgent"}'::jsonb, 0)
  RETURNING id INTO v_cond_id;

  -- YES branch: urgent lead
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'yes', 'send_message',
    '{"text":"🚨 *Urgent Request Received!*\n\nThank you for reaching out! Our senior relationship manager will call you within *15 minutes*.\n\nPlease keep your phone handy. 📞\n\n— Team PMG Properties"}'::jsonb, 0);

  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'yes', 'assign_conversation',
    '{"mode":"round_robin"}'::jsonb, 1);

  -- NO branch: normal lead — welcome + wait + qualify
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'no', 'send_message',
    '{"text":"👋 *Welcome to PMG Properties!*\n\nThank you for reaching out. We specialise in *residential & commercial properties* across prime locations.\n\nWhether you''re looking to *buy, sell, or rent* — we''re here to help you find the perfect property. 🏡"}'::jsonb, 0);

  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'no', 'wait',
    '{"amount":1,"unit":"minutes"}'::jsonb, 1);

  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'no', 'send_message',
    '{"text":"To help you find the *perfect property*, could you share:\n\n1️⃣ *Property type* — Flat, Villa, Plot, or Commercial?\n2️⃣ *Location preference* — Which area or city?\n3️⃣ *Budget range* — Approximate amount?\n4️⃣ *Purpose* — Buy or Rent?\n5️⃣ *Timeline* — How soon are you looking?\n\nOur team will send you the best matching options! 🔑"}'::jsonb, 2);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. PROPERTY TYPE NAVIGATOR (keyword_match)
  --    Branch A — flat / apartment : show flat inventory + prices
  --    Branch B — villa            : show villa inventory
  --    Branch C — everything else  : show general overview
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (v_user_id, v_org_id,
    '🏘️ Property Type Navigator',
    'Detects whether lead wants a flat, villa, or plot and sends the relevant inventory snapshot.',
    'keyword_match',
    '{"keywords":["flat","apartment","villa","bungalow","plot","land","commercial","office","shop","1bhk","2bhk","3bhk","4bhk"],"match_type":"contains","case_sensitive":false}'::jsonb, FALSE)
  RETURNING id INTO v_auto_id;

  -- Root condition: flat / apartment?
  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'condition',
    '{"subject":"message_content","value":"flat"}'::jsonb, 0)
  RETURNING id INTO v_cond_id;

  -- YES — flat
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'yes', 'send_message',
    '{"text":"🏢 *Flat / Apartment Options at PMG*\n\n📐 *1 BHK* — ₹25L–₹40L (450–650 sq ft)\n📐 *2 BHK* — ₹45L–₹75L (850–1200 sq ft)\n📐 *3 BHK* — ₹80L–₹1.2Cr (1400–1800 sq ft)\n📐 *4 BHK Luxury* — ₹1.5Cr+ (2200+ sq ft)\n\n✅ Ready-to-move & under-construction options\n✅ RERA registered projects\n✅ Bank loan up to 90%\n\nReply with your *preferred BHK & budget* and we''ll shortlist the best options for you! 🎯"}'::jsonb, 0);

  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'yes', 'send_message',
    '{"text":"📅 Want to do a *free site visit*?\nReply *VISIT* and our team will arrange it at your convenience!"}'::jsonb, 1);

  -- NO — check villa?
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'no', 'condition',
    '{"subject":"message_content","value":"villa"}'::jsonb, 0)
  RETURNING id INTO v_cond2_id;

  -- YES — villa
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond2_id, 'yes', 'send_message',
    '{"text":"🏡 *Villa / Bungalow Options at PMG*\n\n🌳 *3 BHK Villa* — ₹1.2Cr–₹1.8Cr\n🌳 *4 BHK Villa* — ₹1.8Cr–₹2.5Cr\n🌳 *5 BHK Luxury Bungalow* — ₹3Cr+\n\n✅ Gated communities with 24/7 security\n✅ Private garden & parking\n✅ Club house, gym & pool amenities\n✅ Vastu compliant designs\n\nReply *VISIT* to schedule a free site visit! 🏌️"}'::jsonb, 0);

  -- NO — general properties
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond2_id, 'no', 'send_message',
    '{"text":"🏗️ *PMG Properties — Full Portfolio*\n\n🏢 Flats & Apartments — ₹25L onwards\n🏡 Villas & Bungalows — ₹1.2Cr onwards\n🌾 Plots & Land — ₹15L onwards\n🏪 Commercial — ₹30L onwards\n🏬 Office Spaces — on request\n\nTell us your *budget and purpose (buy/rent)* and our team will send you a customised list within *30 minutes*! ⚡"}'::jsonb, 0);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. BUDGET QUALIFIER (keyword_match)
  --    Branch A — premium (crore) : luxury properties
  --    Branch B — mid-range       : standard properties + loan help
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (v_user_id, v_org_id,
    '💰 Budget Qualifier',
    'Branches on crore vs lakh budget and shows relevant inventory with loan info.',
    'keyword_match',
    '{"keywords":["budget","price","cost","lakh","crore","affordable","cheap","rate","how much","what is the price"],"match_type":"contains","case_sensitive":false}'::jsonb, FALSE)
  RETURNING id INTO v_auto_id;

  -- Condition: premium budget (crore)?
  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'condition',
    '{"subject":"message_content","value":"crore"}'::jsonb, 0)
  RETURNING id INTO v_cond_id;

  -- YES — premium
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'yes', 'send_message',
    '{"text":"💎 *Premium & Luxury Properties — PMG*\n\nFor budgets above ₹1 Crore, we have:\n\n🏡 *Luxury Villas* — ₹1.2Cr to ₹5Cr\n🌇 *Penthouse Apartments* — ₹1.5Cr to ₹4Cr\n🏢 *Premium Commercial* — ₹2Cr onwards\n\n✨ Features:\n• Prime locations\n• World-class amenities\n• Dedicated relationship manager\n• Private viewings available\n\nReply *PREMIUM* and our luxury property specialist will call you within *1 hour*. 👑"}'::jsonb, 0);

  -- NO — mid-range with loan help
  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'no', 'send_message',
    '{"text":"🏠 *Properties for Every Budget — PMG*\n\n💵 Under ₹30L → 1 BHK Flats & Plots\n💵 ₹30L–₹60L → 2 BHK Flats (Ready to move)\n💵 ₹60L–₹1Cr → 3 BHK Flats & Duplex\n\n🏦 *Home Loan Made Easy:*\n• Up to 90% financing\n• EMI from ₹8,000/month\n• 15+ bank partners\n• Free loan consultation\n\nShare your *exact budget* and we''ll find properties with the *lowest EMI* for you! 📊"}'::jsonb, 0);

  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
  VALUES (v_auto_id, v_cond_id, 'no', 'send_message',
    '{"text":"🧮 Want to check your *loan eligibility*?\nReply *LOAN* and our finance team will assist you FREE of charge! 🙌"}'::jsonb, 1);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. SITE VISIT SCHEDULER (keyword_match)
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (v_user_id, v_org_id,
    '📅 Site Visit Scheduler',
    'Collects visit details when a lead wants to see a property.',
    'keyword_match',
    '{"keywords":["visit","site visit","see","show","book","schedule","appointment","VISIT"],"match_type":"contains","case_sensitive":false}'::jsonb, FALSE)
  RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'send_message',
    '{"text":"🎉 *Great choice — let''s arrange your site visit!*\n\n📅 *Available slots:*\n• Monday–Saturday: 10:00 AM – 6:00 PM\n• Sunday: 11:00 AM – 4:00 PM\n\nPlease share:\n✅ Your *preferred date & time*\n✅ Your *full name*\n✅ Which properties you''d like to visit\n\nOur relationship manager will *confirm within 30 minutes* and arrange pick-up if needed. 🚗"}'::jsonb, 0);

  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'send_message',
    '{"text":"📞 Direct contact for immediate assistance:\n*+91-XXXXXXXXXX* (10 AM – 7 PM)\n\nWe look forward to showing you your future home! 🏡"}'::jsonb, 1);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 5. LOAN ENQUIRY (keyword_match)
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (v_user_id, v_org_id,
    '🏦 Loan & Finance Enquiry',
    'Answers home loan questions and offers free eligibility check.',
    'keyword_match',
    '{"keywords":["loan","emi","bank","finance","home loan","mortgage","interest","eligibility","LOAN"],"match_type":"contains","case_sensitive":false}'::jsonb, FALSE)
  RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'send_message',
    '{"text":"🏦 *Free Home Loan Assistance — PMG*\n\nWe partner with *15+ leading banks*:\n• SBI • HDFC • ICICI • Axis • PNB\n• Bank of Baroda • Kotak & more\n\n💳 *Benefits:*\n✅ Up to *90% financing*\n✅ Interest from *8.40% p.a.*\n✅ Tenure up to *30 years*\n✅ Pre-approval in *48 hours*\n✅ Zero processing fee for select banks\n✅ Doorstep documentation service\n\n🔢 *Quick EMI Reference (₹50L loan, 20yr):*\n• 8.5% → ₹43,391/month\n• 9.0% → ₹44,986/month\n• 9.5% → ₹46,607/month"}'::jsonb, 0);

  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'wait',
    '{"amount":1,"unit":"minutes"}'::jsonb, 1);

  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'send_message',
    '{"text":"📋 To check your *loan eligibility for FREE*, share:\n1️⃣ Monthly income\n2️⃣ Existing EMIs (if any)\n3️⃣ Property budget\n\nOur finance expert will calculate your *maximum eligible amount* and the *best interest rate* available for you! 💡"}'::jsonb, 2);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 6. NOT INTERESTED / OPT-OUT (keyword_match)
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO automations (user_id, org_id, name, description, trigger_type, trigger_config, is_active)
  VALUES (v_user_id, v_org_id,
    '🚫 Not Interested / Opt-Out',
    'Gracefully closes conversation when lead opts out.',
    'keyword_match',
    '{"keywords":["not interested","no thanks","stop","unsubscribe","dont contact","do not contact","bye","goodbye","later"],"match_type":"contains","case_sensitive":false}'::jsonb, FALSE)
  RETURNING id INTO v_auto_id;

  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'send_message',
    '{"text":"😊 Absolutely understood — no problem at all!\n\nIf you ever need property advice or see something interesting in the market, feel free to reach out anytime. We''re always here.\n\nWishing you all the best! 🙏\n— *Team PMG Properties*"}'::jsonb, 0);

  INSERT INTO automation_steps (automation_id, step_type, step_config, position)
  VALUES (v_auto_id, 'close_conversation',
    '{}'::jsonb, 1);

  RAISE NOTICE '6 real estate automations with nested branches created for user %', v_user_id;
END $$;

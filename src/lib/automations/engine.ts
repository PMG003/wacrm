import type {
  Automation,
  AutomationLogStepResult,
  AutomationStep,
  AutomationTriggerType,
  AiReplyStepConfig,
  ConditionStepConfig,
  KeywordMatchTriggerConfig,
  SendMessageStepConfig,
  SendTemplateStepConfig,
  SendWebhookStepConfig,
  TagStepConfig,
  UpdateContactFieldStepConfig,
  WaitStepConfig,
  CreateDealStepConfig,
  AssignConversationStepConfig,
} from '@/types'
import { supabaseAdmin } from './admin-client'
import { engineSendText, engineSendTemplate, engineSendAudio } from './meta-send'
import { generateAiReply } from './ai-provider'

const DEFAULT_AI_SYSTEM_PROMPT = `You are Rahul, a senior property consultant at GS Realty, Kolkata. You talk to people over WhatsApp. You are a real person doing a real job — helpful, knowledgeable about Kolkata real estate, and genuinely interested in finding people the right property.

PRIMARY LANGUAGE: English. If the customer writes in Bengali, Hindi, or any other language, switch to that language for the entire conversation and never switch back.

━━━━━━━━━━━━━━━━━━━━━
WHO YOU ARE
━━━━━━━━━━━━━━━━━━━━━
You work for Gajendra Singh (founder of GS Realty — 25 years in Kolkata real estate, started during the IT boom in 1999). GS Realty has helped Mahindra, TCS, ICICI Bank, IIHM find their Kolkata offices and hundreds of families find homes. You personally handle WhatsApp inquiries and pre-qualify leads before connecting the serious ones to Gajendra Sir directly.

━━━━━━━━━━━━━━━━━━━━━
SOUND HUMAN — THIS IS CRITICAL
━━━━━━━━━━━━━━━━━━━━━
You are texting from your phone during a working day. Write exactly like that.

DO:
- Vary how you open messages. Never start with "I" every time. Mix it up:
  "Hey [name] —", "Good timing, actually.", "So I was just looking at this...", "Yeah, Newtown has been moving fast lately."
- Use natural phrasing: "to be honest", "actually", "look —", "thing is", "fair enough"
- Reference your day or work context naturally: "Was literally just at a site in Rajarhat this morning", "Just got off a call with a client about this same building"
- Show you remember things: "You mentioned budget around ₹80L — so this one's interesting"
- Match their energy — if they're brief, be brief. If they're chatty, expand a little.
- Use dashes "—" and "..." the way humans naturally do in texts
- One emoji max, only when it genuinely fits

DON'T:
- Never use bullet points or numbered lists in your messages
- Never write like a brochure or a template
- Never start every message with "Hi [Name]!"
- Never use "I hope this message finds you well" or corporate phrases
- Never sound like you're reading from a script
- Never reveal you are an AI, bot, or automated system — you are Rahul, a real person

━━━━━━━━━━━━━━━━━━━━━
GS REALTY — WHAT WE HAVE
━━━━━━━━━━━━━━━━━━━━━
COMMERCIAL FOR RENT (100+ options):
- Imagine Techpark, Sector V — ₹60–80/sq ft | IT-ready, major tenants in building
- Mani Casadona, Newtown — ₹60–70/sq ft | Grade-A, corporate address
- Martin Burn Business Park, Sector V — 17th floor, 3,030 sq ft, ₹43/sq ft (₹1.3L/month), semi-furnished, 3+3+3 lease, 2 car parks

COMMERCIAL FOR SALE (50+ options):
- Ambuja Neotia Ecospace, Newtown — ₹6,000/sq ft
- Adventz Infinity @5, Sector V — ₹6,000–10,000/sq ft

RESIDENTIAL FOR SALE (23+ options):
- Siddha Serena, Rajarhat — 3BHK, 984 sq ft
- Orbit Urban Park, Newtown — 3BHK + study

RESIDENTIAL FOR RENT (45+ options):
- PS Aurus, EM Bypass — 4BHK, terrace + pool, premium
- Manikaran, Beleghata — 3BHK + servant room, family-friendly

MARKET BENCHMARKS:
- Sector V commercial: ₹60–80/sq ft rent | ₹6,000–10,000/sq ft sale
- Newtown commercial: ₹60–70/sq ft rent
- Newtown/Rajarhat residential: ₹35L–1.8Cr
- EM Bypass premium: ₹80L–2.5Cr

━━━━━━━━━━━━━━━━━━━━━
QUALIFY — ONE QUESTION AT A TIME
━━━━━━━━━━━━━━━━━━━━━
Find out (naturally, across the conversation — not a form):
1. Buy / rent / invest?
2. Commercial office or residential flat?
3. Budget and source (loan / own / company lease)?
4. Timeline — 1 month, 3 months, or exploring?
5. Preferred area — and why (near office, school, relatives)?

LEAD SCORE (decide by message 4–5):
- HOT: Budget confirmed + timeline <60 days + specific area → push for site visit → [[HANDOVER]]
- WARM: Budget range + vague timeline → share 1–2 matching properties, follow up in 2 days
- COLD: No budget + just browsing → plant one good seed, re-engage in a week

━━━━━━━━━━━━━━━━━━━━━
TRUST — DROP NATURALLY, NOT AS A PITCH
━━━━━━━━━━━━━━━━━━━━━
When relevant, weave in:
- "We've placed TCS and Mahindra's Kolkata offices — so commercial is kind of our strong suit"
- "Gajendra Sir's been doing this since '99 — he knows every building in Sector V personally"
- "We've got 100+ commercial listings live right now — I can narrow it down fast once I know your size requirement"
- "I've personally walked most of these units — I'll tell you honestly which ones are worth your time"

━━━━━━━━━━━━━━━━━━━━━
OBJECTIONS — HANDLE LIKE A PERSON
━━━━━━━━━━━━━━━━━━━━━
"Too expensive" → "Hmm, let me check — the per sqft actually comes out to [X], which is slightly below what's going in [area] right now. Want me to send a quick comparison?"
"Market's slow" → "To be honest, the quality ones are still moving. Newtown registrations were up last quarter. The 'slow market' mostly affects overpriced units."
"Need to think" → "Fair enough — which of the options felt closest to what you need? I'll hold it informally for a couple of days."
"Checking with others" → "Makes sense. Happy to be your second opinion — we have some inventory that's not listed anywhere else."
"Loan concern" → "We work with 6 banks directly — our clients usually get faster processing. Want me to make an intro?"

━━━━━━━━━━━━━━━━━━━━━
SITE VISIT SCHEDULING
━━━━━━━━━━━━━━━━━━━━━
When a lead says they want to see a property:
1. Ask: "Perfect — what date and time works best for you?"
2. Once they confirm a date/time, end your reply with [[VISIT:YYYY-MM-DD HH:mm]]
3. Example reply: "Great, I'll book that slot. See you on 10th June at 11 AM!" [[VISIT:2026-06-10 11:00]]
Only embed [[VISIT:...]] after the customer explicitly confirms a specific date and time.

━━━━━━━━━━━━━━━━━━━━━
WHEN TO HAND OVER — [[HANDOVER]]
━━━━━━━━━━━━━━━━━━━━━
End your reply with [[HANDOVER]] (hidden tag, not shown to customer) when:
- Lead confirms budget + property type + asks about next steps or site visit
- Lead is actively negotiating a specific unit
- Lead asks to speak to a senior person or calls for Gajendra Sir
- Lead mentions a competing project — escalate immediately
- 6+ exchanges and no clear next step agreed

━━━━━━━━━━━━━━━━━━━━━
FOLLOW-UP MESSAGES (when you're reaching out, not responding)
━━━━━━━━━━━━━━━━━━━━━
When you're following up (customer hasn't messaged recently):
- Acknowledge the gap lightly — don't pretend it didn't happen: "Hey, just checking in —"
- Lead with something NEW (a listing, a market fact, a time-sensitive detail) — not "just following up"
- Be genuinely brief — 1–2 sentences, then one soft question
- If they haven't replied to 2+ follow-ups, try a completely different angle
- Never sound desperate or apologetic

OFF-TOPIC: One line — "I only handle property here" — then ask one qualifying question.

ABSOLUTE RULES:
- Never admit you are automated, AI, or a bot
- Never invent prices, floor numbers, or availability not listed above
- Max 3 sentences per message
- No discounts without "let me check with Gajendra Sir first"
- Every message ends with a question or a clear next step`

// ------------------------------------------------------------
// Dynamic per-tenant prompt builder
// ------------------------------------------------------------

async function buildDynamicPrompt(orgId?: string): Promise<string> {
  if (!orgId) return DEFAULT_AI_SYSTEM_PROMPT

  const db = supabaseAdmin()
  const { data: cfg } = await db
    .from('org_ai_config')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!cfg) return DEFAULT_AI_SYSTEM_PROMPT

  // If the tenant set a full custom prompt, use it verbatim
  if (cfg.custom_system_prompt?.trim()) return cfg.custom_system_prompt.trim()

  // Fetch knowledge base documents and append to prompt
  let knowledgeBaseText = ''
  try {
    const { data: docs } = await db
      .from('org_knowledge_base')
      .select('filename, content_text')
      .eq('org_id', orgId)
      .not('content_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5)
    if (docs?.length) {
      knowledgeBaseText = '\n\nKNOWLEDGE BASE DOCUMENTS (use this information to answer property questions accurately):\n'
      for (const doc of docs) {
        if (doc.content_text) {
          knowledgeBaseText += `\n--- ${doc.filename} ---\n${doc.content_text.slice(0, 3000)}\n`
        }
      }
    }
  } catch {
    // non-fatal
  }

  const agentName = cfg.agent_name || 'Riya'
  const companyName = cfg.company_name || ''
  const companyAbout = cfg.company_about || ''
  const serviceAreas: string[] = cfg.service_areas ?? []
  const languages: string[] = cfg.languages ?? ['en']
  const tone: string = cfg.agent_tone ?? 'professional'
  const activeListings: string = cfg.active_listings || ''

  const LANG_FULL: Record<string, string> = {
    en: 'English', hi: 'Hindi', bn: 'Bengali', mr: 'Marathi',
    ta: 'Tamil', te: 'Telugu', kn: 'Kannada', gu: 'Gujarati',
    pa: 'Punjabi', ml: 'Malayalam',
  }
  const langList = languages.map(l => LANG_FULL[l] ?? l).join(', ')

  const TONE_DESC: Record<string, string> = {
    professional: 'You are balanced, trustworthy, and data-driven. Build rapport before pushing for a close.',
    aggressive: 'You are a hard closer. Push every conversation toward a commitment. Create urgency, handle objections fast, and always ask for the next step.',
    friendly: 'You are warm, consultative, and empathetic. Build genuine trust, ask about family needs, and guide the customer at their own pace.',
  }
  const toneDesc = TONE_DESC[tone] ?? TONE_DESC.professional

  let prompt = `You are ${agentName}, a real estate agent${companyName ? ` at ${companyName}` : ''}.`
  if (companyAbout) prompt += ` ${companyAbout}`
  prompt += `\n\n${toneDesc}`
  prompt += `\n\nYou communicate via WhatsApp. Always match the customer's language exactly. Supported languages: ${langList}.`

  if (serviceAreas.length > 0) {
    prompt += `\n\nSERVICE AREAS: ${serviceAreas.join(', ')}.`
  }

  if (activeListings) {
    prompt += `\n\nACTIVE LISTINGS:\n${activeListings}`
  }

  prompt += `\n\nHOW TO COMMUNICATE:
- 2–4 sentences max per WhatsApp message. No walls of text.
- Always match the customer's language
- Always end with ONE clear question or next step
- 1 emoji max per message

NEVER:
- Admit you are an AI or bot
- Invent prices or project names not given to you
- Give a discount without checking with the team first`

  return prompt + knowledgeBaseText
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

export interface AutomationContext {
  /** Raw message text, for keyword_match + message_content conditions. */
  message_text?: string
  /** Conversation the event belongs to, if any. */
  conversation_id?: string
  /** Whether the inbound message was voice — ai_reply will respond with audio. */
  input_type?: 'text' | 'audio'
  /** ISO 639-1 language code detected by Whisper (e.g. "hi", "en", "ta"). */
  input_language?: string
  /** Organisation id — used to load per-tenant AI config from org_ai_config. */
  org_id?: string
  /** Arbitrary variables accumulated during execution. */
  vars?: Record<string, unknown>
  /** The tag id that was added, for tag_added trigger. */
  tag_id?: string
  /** Agent the conversation was assigned to, for conversation_assigned. */
  agent_id?: string
}

export interface DispatchInput {
  userId: string
  triggerType: AutomationTriggerType
  contactId?: string | null
  context?: AutomationContext
}

/**
 * Fire all active automations matching the given trigger for a user.
 *
 * Must never throw — callers use fire-and-forget from the webhook.
 * All errors are caught and logged; per-automation failures are
 * recorded into automation_logs with status='failed'.
 */
export async function runAutomationsForTrigger(input: DispatchInput): Promise<void> {
  try {
    const db = supabaseAdmin()
    const { data: automations, error } = await db
      .from('automations')
      .select('*')
      .eq('user_id', input.userId)
      .eq('trigger_type', input.triggerType)
      .eq('is_active', true)

    if (error) {
      console.error('[automations] fetch failed:', error)
      return
    }
    if (!automations || automations.length === 0) return

    for (const automation of automations as Automation[]) {
      if (!triggerMatches(automation, input.context)) continue
      try {
        await executeAutomation(automation, input)
      } catch (err) {
        console.error('[automations] execute failed:', automation.id, err)
      }
    }
  } catch (err) {
    console.error('[automations] dispatch failed:', err)
  }
}

/**
 * Resume a run that was parked at a wait step. Called from the cron
 * endpoint after it grabs a due `automation_pending_executions` row.
 */
export async function resumePendingExecution(pending: {
  id: string
  automation_id: string
  user_id: string
  contact_id: string | null
  log_id: string | null
  parent_step_id: string | null
  branch: 'yes' | 'no' | null
  next_step_position: number
  context: AutomationContext
}): Promise<void> {
  const db = supabaseAdmin()
  const { data: automation, error } = await db
    .from('automations')
    .select('*')
    .eq('id', pending.automation_id)
    .single()

  if (error || !automation) {
    console.error('[automations] resume: missing automation', pending.automation_id, error)
    await markPending(pending.id, 'failed')
    return
  }

  try {
    await executeStepsFrom({
      automation: automation as Automation,
      contactId: pending.contact_id,
      context: pending.context ?? {},
      parentStepId: pending.parent_step_id,
      branch: pending.branch,
      startPosition: pending.next_step_position,
      logId: pending.log_id,
      triggerEvent: 'resumed_wait',
    })
    await markPending(pending.id, 'done')
  } catch (err) {
    console.error('[automations] resume failed:', err)
    await markPending(pending.id, 'failed')
  }
}

// ------------------------------------------------------------
// Internal execution
// ------------------------------------------------------------

async function executeAutomation(automation: Automation, input: DispatchInput) {
  const db = supabaseAdmin()

  const { data: log, error: logErr } = await db
    .from('automation_logs')
    .insert({
      automation_id: automation.id,
      user_id: automation.user_id,
      contact_id: input.contactId ?? null,
      trigger_event: input.triggerType,
      steps_executed: [],
      status: 'success',
    })
    .select()
    .single()

  if (logErr || !log) {
    console.error('[automations] cannot create log:', logErr)
    return
  }

  await executeStepsFrom({
    automation,
    contactId: input.contactId ?? null,
    context: input.context ?? {},
    parentStepId: null,
    branch: null,
    startPosition: 0,
    logId: log.id,
    triggerEvent: input.triggerType,
  })

  // Atomic counter update via the SQL function from migration 007.
  // Doing this with a client-side read-modify-write raced when the
  // same automation fired for two contacts simultaneously — both
  // would read N and both write N+1, losing one count permanently.
  const { error: rpcErr } = await db.rpc('increment_automation_execution_count', {
    p_automation_id: automation.id,
  })
  if (rpcErr) {
    console.error('[automations] increment counter failed:', rpcErr)
  }
}

interface ExecuteArgs {
  automation: Automation
  contactId: string | null
  context: AutomationContext
  parentStepId: string | null
  branch: 'yes' | 'no' | null
  startPosition: number
  logId: string | null
  triggerEvent: string
}

async function executeStepsFrom(args: ExecuteArgs): Promise<void> {
  const db = supabaseAdmin()

  const baseQuery = db
    .from('automation_steps')
    .select('*')
    .eq('automation_id', args.automation.id)
    .gte('position', args.startPosition)
    .order('position', { ascending: true })

  const scoped =
    args.parentStepId === null
      ? baseQuery.is('parent_step_id', null)
      : baseQuery.eq('parent_step_id', args.parentStepId).eq('branch', args.branch ?? 'yes')

  const { data: steps, error: stepsErr } = await scoped

  if (stepsErr) {
    await finalizeLog(args.logId, 'failed', stepsErr.message)
    return
  }
  if (!steps || steps.length === 0) {
    if (args.parentStepId === null && args.logId) {
      await finalizeLog(args.logId, 'success', null)
    }
    return
  }

  const results: AutomationLogStepResult[] = []
  let status: 'success' | 'partial' | 'failed' = 'success'
  let errorMessage: string | null = null

  for (const step of steps as AutomationStep[]) {
    // `wait` is the suspension point: enqueue and stop processing this
    // scope. The cron endpoint will pick it up later.
    if (step.step_type === 'wait') {
      const cfg = step.step_config as WaitStepConfig
      const ms = waitMs(cfg)
      await db.from('automation_pending_executions').insert({
        automation_id: args.automation.id,
        user_id: args.automation.user_id,
        contact_id: args.contactId,
        log_id: args.logId,
        parent_step_id: args.parentStepId,
        branch: args.branch,
        next_step_position: step.position + 1,
        context: args.context,
        run_at: new Date(Date.now() + ms).toISOString(),
        status: 'pending',
      })
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail: `waiting ${cfg.amount} ${cfg.unit}`,
      })
      status = 'partial'
      await appendResults(args.logId, results, status, errorMessage)
      return
    }

    try {
      if (step.step_type === 'condition') {
        const cfg = step.step_config as ConditionStepConfig
        const taken = await evaluateCondition(cfg, args)
        results.push({
          step_id: step.id,
          step_type: 'condition',
          status: 'success',
          detail: `branch=${taken ? 'yes' : 'no'}`,
        })
        // Recurse into the chosen branch at position 0 (children use their
        // own ordering within the branch scope).
        await executeStepsFrom({
          ...args,
          parentStepId: step.id,
          branch: taken ? 'yes' : 'no',
          startPosition: 0,
          logId: args.logId,
        })
        continue
      }

      const detail = await runStep(step, args)
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'failed',
        detail: msg,
      })
      status = 'failed'
      errorMessage = msg
      break
    }
  }

  if (args.parentStepId === null) {
    await appendResults(args.logId, results, status, errorMessage)
  } else {
    // Nested branch — just append results; parent scope decides final status.
    await appendResults(args.logId, results, null, errorMessage)
  }
}

async function runStep(step: AutomationStep, args: ExecuteArgs): Promise<string> {
  const db = supabaseAdmin()

  switch (step.step_type) {
    case 'send_message': {
      const cfg = step.step_config as SendMessageStepConfig
      if (!args.contactId) throw new Error('send_message needs a contact')
      const text = interpolate(cfg.text, args)
      if (!text.trim()) throw new Error('send_message has empty text')
      const conversationId = await resolveConversationId(args)
      const { whatsapp_message_id } = await engineSendText({
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        text,
      })
      return `sent via Meta (${whatsapp_message_id})`
    }

    case 'send_template': {
      const cfg = step.step_config as SendTemplateStepConfig
      if (!args.contactId) throw new Error('send_template needs a contact')
      if (!cfg.template_name) throw new Error('send_template needs template_name')
      const conversationId = await resolveConversationId(args)
      // Meta templates use positional {{1}}, {{2}}, … placeholders, so
      // we MUST emit params in strict numeric order. Lexicographic sort
      // of "1", "2", …, "10" yields "1", "10", "2", … which silently
      // scrambles every template with ≥10 variables.
      const params = cfg.variables
        ? Object.keys(cfg.variables)
            .sort((a, b) => {
              const na = Number(a)
              const nb = Number(b)
              const aNum = Number.isFinite(na)
              const bNum = Number.isFinite(nb)
              if (aNum && bNum) return na - nb
              if (aNum) return -1
              if (bNum) return 1
              return a.localeCompare(b)
            })
            .map((k) => String(cfg.variables![k]))
        : []
      const { whatsapp_message_id } = await engineSendTemplate({
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        templateName: cfg.template_name,
        language: cfg.language,
        params,
      })
      return `template sent via Meta (${whatsapp_message_id})`
    }

    case 'add_tag': {
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('add_tag needs contact + tag_id')
      await db
        .from('contact_tags')
        .upsert(
          { contact_id: args.contactId, tag_id: cfg.tag_id },
          { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
        )
      return `tag ${cfg.tag_id} added`
    }

    case 'remove_tag': {
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('remove_tag needs contact + tag_id')
      await db
        .from('contact_tags')
        .delete()
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.tag_id)
      return `tag ${cfg.tag_id} removed`
    }

    case 'assign_conversation': {
      const cfg = step.step_config as AssignConversationStepConfig
      if (!args.contactId) throw new Error('assign_conversation needs a contact')
      let agentId = cfg.agent_id
      if (cfg.mode === 'round_robin') {
        const { data: profiles } = await db
          .from('profiles')
          .select('user_id')
          .eq('user_id', args.automation.user_id)
          .limit(1)
        agentId = profiles?.[0]?.user_id
      }
      if (!agentId) return 'no agent resolved'
      await db
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('user_id', args.automation.user_id)
        .eq('contact_id', args.contactId)
      return `assigned to ${agentId}`
    }

    case 'update_contact_field': {
      const cfg = step.step_config as UpdateContactFieldStepConfig
      if (!args.contactId) throw new Error('update_contact_field needs a contact')
      const allowed = new Set(['name', 'email', 'company'])
      if (!allowed.has(cfg.field)) {
        return `field ${cfg.field} not writable from automations`
      }
      await db
        .from('contacts')
        .update({ [cfg.field]: cfg.value, updated_at: new Date().toISOString() })
        .eq('id', args.contactId)
      return `${cfg.field} updated`
    }

    case 'create_deal': {
      const cfg = step.step_config as CreateDealStepConfig
      if (!cfg.pipeline_id || !cfg.stage_id) throw new Error('create_deal needs pipeline + stage')
      await db.from('deals').insert({
        user_id: args.automation.user_id,
        pipeline_id: cfg.pipeline_id,
        stage_id: cfg.stage_id,
        contact_id: args.contactId,
        title: interpolate(cfg.title, args),
        value: cfg.value ?? 0,
        status: 'open',
      })
      return 'deal created'
    }

    case 'send_webhook': {
      const cfg = step.step_config as SendWebhookStepConfig
      if (!cfg.url) throw new Error('send_webhook needs url')
      const body = cfg.body_template ? interpolate(cfg.body_template, args) : JSON.stringify(args.context)
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
        body,
      })
      if (!res.ok) throw new Error(`webhook returned ${res.status}`)
      return `webhook ${res.status}`
    }

    case 'close_conversation': {
      if (!args.contactId) throw new Error('close_conversation needs a contact')
      await db
        .from('conversations')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('user_id', args.automation.user_id)
        .eq('contact_id', args.contactId)
      return 'conversation closed'
    }

    case 'ai_reply': {
      const cfg = step.step_config as AiReplyStepConfig
      if (!args.contactId) throw new Error('ai_reply needs a contact')

      const conversationId = await resolveConversationId(args)

      // Fetch contact name for context
      const { data: contact } = await db
        .from('contacts')
        .select('name, phone')
        .eq('id', args.contactId)
        .maybeSingle()

      // Fetch existing AI lead profile note for memory injection
      const { data: profileNote } = await db
        .from('contact_notes')
        .select('id, note_text')
        .eq('contact_id', args.contactId)
        .like('note_text', '[AI Lead Profile]%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Fetch recent conversation messages + one extra to detect follow-up vs reactive
      const fetchLimit = (cfg.max_history ?? 50) + 1
      const { data: recentMessages } = await db
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(fetchLimit)

      if (!recentMessages?.length) throw new Error('no messages to respond to')

      // Detect follow-up mode: last message in conversation is from us, not the customer
      const sortedByTime = [...recentMessages].reverse()
      const lastMsg = sortedByTime[sortedByTime.length - 1]
      const isFollowUp = lastMsg?.sender_type !== 'customer'

      // Compute conversation stats for context injection
      const totalMessages = recentMessages.length
      const lastCustomerMsg = recentMessages.find(m => m.sender_type === 'customer')
      const daysSinceLastReply = lastCustomerMsg
        ? Math.floor((Date.now() - new Date(lastCustomerMsg.created_at).getTime()) / 86_400_000)
        : null

      // Trim to actual max_history limit (we fetched +1 for follow-up detection)
      const historySlice = recentMessages.slice(0, cfg.max_history ?? 50)

      // Reverse to chronological order, merge consecutive same-role messages
      // so Claude's alternating user/assistant constraint is satisfied
      const merged: { role: 'user' | 'assistant'; content: string }[] = []
      for (const m of [...historySlice].reverse()) {
        const role = m.sender_type === 'customer' ? 'user' : 'assistant'
        const content = (m.content_text ?? '').trim()
        if (!content) continue
        if (merged.length > 0 && merged[merged.length - 1].role === role) {
          merged[merged.length - 1].content += '\n' + content
        } else {
          merged.push({ role, content })
        }
      }

      // Claude requires first message to be user and last message to be user
      while (merged.length > 0 && merged[0].role === 'assistant') merged.shift()
      if (!merged.length || merged[merged.length - 1].role !== 'user') {
        return 'ai_reply skipped: no customer message'
      }

      const isVoice = args.context.input_type === 'audio'
      const systemPrompt = cfg.system_prompt ?? await buildDynamicPrompt(args.context.org_id)

      // Inject contact name, language, lead profile, and voice format instruction
      const contactName = contact?.name && contact.name !== contact?.phone ? contact.name : null
      const detectedLang = args.context.input_language ?? 'en'
      const LANG_NAMES: Record<string, string> = {
        hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', ta: 'Tamil',
        te: 'Telugu', kn: 'Kannada', gu: 'Gujarati', pa: 'Punjabi',
        ml: 'Malayalam', ur: 'Urdu', or: 'Odia',
      }
      const langName = LANG_NAMES[detectedLang]
      let finalPrompt = systemPrompt
      if (contactName) {
        finalPrompt += `\n\nThe customer's name is ${contactName}.`
      }
      if (langName) {
        finalPrompt += `\n\nLANGUAGE RULE: This customer is speaking in ${langName}. You MUST reply entirely in ${langName}. Do not use English at all. Every word of your response must be in ${langName}.`
      }
      if (profileNote?.note_text) {
        const profileLines = profileNote.note_text
          .split('\n')
          .slice(1)
          .filter((l: string) => l.trim())
          .join('\n')
        if (profileLines) {
          finalPrompt += `\n\nCONTACT MEMORY — what we already know about this person:\n${profileLines}\n\nDo NOT re-ask anything captured above. Reference it naturally in conversation.`
        }
      }

      // Self-learning context: inject conversation state and adaptive strategy
      {
        const ctxLines: string[] = []
        ctxLines.push(`Messages exchanged so far: ${totalMessages}`)
        if (daysSinceLastReply !== null && daysSinceLastReply > 0) {
          ctxLines.push(`Days since customer last replied: ${daysSinceLastReply}`)
        }
        if (isFollowUp) {
          ctxLines.push(`Mode: FOLLOW-UP — you are reaching out, the customer has not messaged recently. Lead with something new and valuable, not "just checking in". Be brief and end with one soft question.`)
        } else {
          ctxLines.push(`Mode: REACTIVE — customer just messaged. Respond naturally to what they said.`)
        }

        // Extract "Next Approach" and "Engagement Level" from stored profile if present
        if (profileNote?.note_text) {
          const nextApproachLine = profileNote.note_text.split('\n').find((l: string) => l.startsWith('Next Approach:'))
          const engagementLine = profileNote.note_text.split('\n').find((l: string) => l.startsWith('Engagement Level:'))
          const failedLine = profileNote.note_text.split('\n').find((l: string) => l.startsWith('Failed Approaches:'))
          if (nextApproachLine) ctxLines.push(`Strategy guidance: ${nextApproachLine}`)
          if (engagementLine) ctxLines.push(engagementLine)
          if (failedLine) ctxLines.push(`Avoid: ${failedLine}`)
        }

        finalPrompt += `\n\nCONVERSATION CONTEXT:\n${ctxLines.join('\n')}`
      }
      if (isVoice) {
        finalPrompt += `\n\nVOICE RESPONSE FORMAT: Your reply MUST have exactly two labelled sections:
[VOICE]: 2–3 short conversational sentences in the customer's language (${langName ?? 'English'}). This will be spoken aloud — keep it natural and brief.
[DETAILS]: ALWAYS write this section in ENGLISH only, regardless of the customer's language. If you mentioned any specific property (price, BHK, location, amenities), list the key details as a clean WhatsApp text card. Write NONE if no property details apply.`
      }

      const messagesWithSystem = [
        { role: 'system' as const, content: finalPrompt },
        ...merged,
      ]

      let rawReply = await generateAiReply(messagesWithSystem, 400)
      if (!rawReply) throw new Error('AI returned empty response')

      const shouldHandover = rawReply.includes('[[HANDOVER]]')
      rawReply = rawReply.replace('[[HANDOVER]]', '').trim()

      // Site visit scheduling — AI embeds [[VISIT:YYYY-MM-DD HH:mm]] when confirmed
      const visitMatch = rawReply.match(/\[\[VISIT:([^\]]+)\]\]/)
      if (visitMatch) {
        rawReply = rawReply.replace(/\[\[VISIT:[^\]]+\]\]/, '').trim()
        const visitDateStr = visitMatch[1].trim()
        // Fire-and-forget: create/upsert a deal with visit date
        ;(async () => {
          try {
            const { data: pipelines } = await db
              .from('pipelines')
              .select('id, stages(id, name)')
              .eq('user_id', args.automation.user_id)
              .limit(1)
              .maybeSingle()
            const pipeline = pipelines as { id: string; stages: { id: string; name: string }[] } | null
            if (pipeline?.id && pipeline.stages?.length) {
              const stage = pipeline.stages[0]
              await db.from('deals').insert({
                user_id: args.automation.user_id,
                pipeline_id: pipeline.id,
                stage_id: stage.id,
                contact_id: args.contactId,
                title: `Site Visit — ${visitDateStr}`,
                value: 0,
                status: 'open',
                expected_close_date: visitDateStr.split(' ')[0],
                notes: `Visit scheduled for ${visitDateStr}. Auto-created by AI agent.`,
              })
              console.log(`[ai_reply] site visit deal created for ${visitDateStr}`)
            }
          } catch (err) {
            console.error('[ai_reply] visit deal creation failed:', err)
          }
        })()
      }

      // Parse [VOICE] / [DETAILS] split for voice messages
      let replyText = rawReply
      let detailsText: string | null = null
      if (isVoice) {
        const voiceMatch = rawReply.match(/\[VOICE\]:\s*([\s\S]*?)(?=\[DETAILS\]:|$)/i)
        const detailsMatch = rawReply.match(/\[DETAILS\]:\s*([\s\S]*?)$/i)
        if (voiceMatch?.[1]?.trim()) {
          replyText = voiceMatch[1].trim()
          const raw = detailsMatch?.[1]?.trim()
          if (raw && !/^none$/i.test(raw)) detailsText = raw
        }
      }

      if (shouldHandover && cfg.handover_message) {
        replyText = replyText ? replyText + '\n\n' + cfg.handover_message : cfg.handover_message
      }

      let whatsapp_message_id: string
      let sent_as: 'audio' | 'text'

      if (isVoice) {
        const audioResult = await engineSendAudio({
          userId: args.automation.user_id,
          conversationId,
          contactId: args.contactId,
          text: replyText,
          voice: detectedLang,
        })
        whatsapp_message_id = audioResult.whatsapp_message_id
        sent_as = audioResult.sent_as
        // Send property details as text only when audio succeeded and details exist
        if (sent_as === 'audio' && detailsText) {
          engineSendText({
            userId: args.automation.user_id,
            conversationId,
            contactId: args.contactId,
            text: detailsText,
          }).catch(err => console.error('[ai_reply] details text failed:', err))
        }
      } else {
        const textResult = await engineSendText({
          userId: args.automation.user_id,
          conversationId,
          contactId: args.contactId,
          text: replyText,
        })
        whatsapp_message_id = textResult.whatsapp_message_id
        sent_as = 'text'
      }

      if (shouldHandover) {
        // Assign conversation to the account owner so inbox lights up
        await db
          .from('conversations')
          .update({
            assigned_agent_id: args.automation.user_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
      }

      // Fire-and-forget: extract and persist lead profile for future conversations
      saveLeadProfile({
        db,
        contactId: args.contactId,
        userId: args.automation.user_id,
        existingNoteId: profileNote?.id ?? null,
        messages: merged,
      }).catch(err => console.error('[ai_reply] profile save failed:', err))

      return `AI ${sent_as} replied (${whatsapp_message_id})${shouldHandover ? ' + handed over to agent' : ''}`
    }

    default:
      return `unknown step: ${step.step_type}`
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Pick the conversation a send-type step should use. Prefer the id the
 * webhook handed us (it's the one that just got the inbound message);
 * fall back to the contact's conversation for resumed/wait paths and
 * manual engine POSTs. Throws if none exists — send steps have
 * no meaningful target without a conversation.
 */
async function resolveConversationId(args: ExecuteArgs): Promise<string> {
  const fromCtx = args.context.conversation_id
  if (fromCtx) return fromCtx
  if (!args.contactId) throw new Error('cannot resolve conversation: no contact')
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('id')
    .eq('user_id', args.automation.user_id)
    .eq('contact_id', args.contactId)
    .maybeSingle()
  if (error) throw new Error(`conversation lookup failed: ${error.message}`)
  if (!data?.id) throw new Error('no conversation for contact')
  return data.id as string
}

function triggerMatches(automation: Automation, ctx: AutomationContext | undefined): boolean {
  if (automation.trigger_type !== 'keyword_match') return true
  const cfg = automation.trigger_config as KeywordMatchTriggerConfig
  if (!cfg?.keywords || cfg.keywords.length === 0) return false
  const text = (ctx?.message_text ?? '').toString()
  if (!text) return false
  const haystack = cfg.case_sensitive ? text : text.toLowerCase()
  return cfg.keywords.some((raw) => {
    const k = cfg.case_sensitive ? raw : raw.toLowerCase()
    return cfg.match_type === 'exact' ? haystack === k : haystack.includes(k)
  })
}

async function evaluateCondition(cfg: ConditionStepConfig, args: ExecuteArgs): Promise<boolean> {
  const db = supabaseAdmin()
  switch (cfg.subject) {
    case 'tag_presence': {
      if (!args.contactId || !cfg.operand) return false
      const { count } = await db
        .from('contact_tags')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.operand)
      return (count ?? 0) > 0
    }
    case 'contact_field': {
      if (!args.contactId || !cfg.operand) return false
      const { data } = await db
        .from('contacts')
        .select(cfg.operand)
        .eq('id', args.contactId)
        .maybeSingle()
      const v = (data as Record<string, unknown> | null)?.[cfg.operand]
      return v != null && String(v) === String(cfg.value ?? '')
    }
    case 'message_content': {
      const text = (args.context.message_text ?? '').toString()
      return text.toLowerCase().includes((cfg.value ?? '').toLowerCase())
    }
    case 'time_of_day': {
      // operand form "HH:mm-HH:mm" — true if now is within that window
      // (supports over-midnight ranges like "18:00-09:00").
      const [from, to] = (cfg.operand ?? '').split('-')
      if (!from || !to) return false
      const now = new Date()
      const mins = now.getHours() * 60 + now.getMinutes()
      const parse = (s: string) => {
        const [h, m] = s.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
      }
      const f = parse(from)
      const t = parse(to)
      return f <= t ? mins >= f && mins < t : mins >= f || mins < t
    }
    default:
      return false
  }
}

function waitMs(cfg: WaitStepConfig): number {
  const unitMs = cfg.unit === 'days' ? 86_400_000 : cfg.unit === 'hours' ? 3_600_000 : 60_000
  return Math.max(1_000, cfg.amount * unitMs)
}

function interpolate(s: string, args: ExecuteArgs): string {
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const [ns, prop] = String(key).split('.')
    if (ns === 'message' && prop === 'text') return String(args.context.message_text ?? '')
    if (ns === 'vars' && prop) return String(args.context.vars?.[prop] ?? '')
    return ''
  })
}

async function appendResults(
  logId: string | null,
  newItems: AutomationLogStepResult[],
  status: 'success' | 'partial' | 'failed' | null,
  errorMessage: string | null,
) {
  if (!logId) return
  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('automation_logs')
    .select('steps_executed, status')
    .eq('id', logId)
    .single()
  const merged = [
    ...((existing?.steps_executed as AutomationLogStepResult[] | undefined) ?? []),
    ...newItems,
  ]
  const update: Record<string, unknown> = { steps_executed: merged }
  // Only overwrite status on the outermost scope — nested branches pass null.
  if (status !== null) {
    update.status = status
  }
  if (errorMessage) update.error_message = errorMessage
  await db.from('automation_logs').update(update).eq('id', logId)
}

async function finalizeLog(
  logId: string | null,
  status: 'success' | 'partial' | 'failed',
  errorMessage: string | null,
) {
  if (!logId) return
  await supabaseAdmin()
    .from('automation_logs')
    .update({ status, error_message: errorMessage })
    .eq('id', logId)
}

async function markPending(id: string, status: 'done' | 'failed') {
  await supabaseAdmin()
    .from('automation_pending_executions')
    .update({ status })
    .eq('id', id)
}

// ------------------------------------------------------------
// Contact memory helpers
// ------------------------------------------------------------

async function saveLeadProfile(args: {
  db: ReturnType<typeof supabaseAdmin>
  contactId: string
  userId: string
  existingNoteId: string | null
  messages: { role: string; content: string }[]
}): Promise<void> {
  const { db, contactId, userId, existingNoteId, messages } = args
  if (messages.length < 2) return // need at least one exchange

  // Use LLM to extract rich structured context + self-learning signals
  const extractionPrompt = `You are a CRM data extractor for a real estate WhatsApp agent. Read this conversation and extract facts plus learning signals.

Return ONLY a plain text block in this exact format (omit any line whose value is unknown or unclear):
Property Type: [flat/office/villa/plot/commercial]
Budget: [e.g. ₹80L, ₹1.2Cr, ₹60/sqft/month]
Purpose: [buy/rent/invest]
Timeline: [e.g. 1 month, 3 months, exploring]
Location Preference: [area names mentioned]
Properties Discussed: [specific property names discussed]
Objections Raised: [concerns raised — price, loan, timing, trust, etc.]
Lead Score: [HOT/WARM/COLD — one sentence why]
Engagement Level: [HIGH = replies fast and asks questions / MEDIUM = replies but brief / LOW = slow or short replies]
What Generated Response: [which topics or approaches made the customer engage more]
Failed Approaches: [what did NOT get a good response]
Next Approach: [one specific recommendation for the next message — what angle to try, what to lead with]
Conversation Summary: [2 sentences — what the customer wants and exactly where things stand]

Do not explain. Output only the lines above, no extra text.`

  let extracted = ''
  try {
    const result = await generateAiReply(
      [
        { role: 'system', content: extractionPrompt },
        {
          role: 'user',
          content: messages.map(m => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n'),
        },
      ],
      300,
    )
    extracted = result?.trim() ?? ''
  } catch {
    // extraction failure is non-fatal — skip silently
    return
  }

  if (!extracted) return

  const noteText = `[AI Lead Profile]\n${extracted}\nLast Contact: ${new Date().toISOString().split('T')[0]}`

  if (existingNoteId) {
    await db.from('contact_notes').update({ note_text: noteText }).eq('id', existingNoteId)
  } else {
    await db.from('contact_notes').insert({ contact_id: contactId, user_id: userId, note_text: noteText })
  }
}

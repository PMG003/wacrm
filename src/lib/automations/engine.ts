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

const DEFAULT_AI_SYSTEM_PROMPT = `You are Riya, a specialist real estate marketing agent for West Bengal, India. You communicate via WhatsApp in Bengali, Hindi, or English — always match the customer's language exactly.

YOUR MISSION: Qualify leads fast, build trust through deep local knowledge, and close deals. Every message must move the conversation forward.

WEST BENGAL MICRO-MARKET KNOWLEDGE:
- North Kolkata (Shyambazar, Ultadanga, Belgachia): ₹30–80L | Legacy families, senior buyers
- South Kolkata (Tollygunge, Garia, Behala, Jadavpur): ₹40–1.2Cr | IT professionals, young families
- East Kolkata (Salt Lake, Baguiati, Kestopur, VIP Road): ₹60L–2Cr | Corporate, NRI, dual-income
- New Town / Rajarhat (Action Area I/II/III, Eco Park): ₹45L–1.8Cr | IT/startup, first-time buyers
- Howrah & Hooghly (Shibpur, Uttarpara, Chandernagore): ₹20–60L | Middle-income, industry workers
- North Bengal (Siliguri, Jalpaiguri): ₹18–55L | Tea garden investors, retirees
- Industrial Belt (Durgapur, Asansol, Bardhaman): ₹15–45L | Factory workers, PSU employees

BENGAL BUYER PSYCHOLOGY:
- Trust is earned through community/para proof — reference local projects and known builders (Merlin, PS Group, Ambuja Neotia, Siddha, Hiland)
- Vastu compliance matters — ask if it is important to them
- Durga Puja (Sep–Oct) and Pohela Boishakh (Apr) = peak buying season — use seasonal anchoring
- Price negotiation is expected — keep 4–7% buffer in listed price
- Always cite HIRA and RERA registration for trust — it closes doubts fast
- Family decisions: Bengali buyers decide with family — invite family to site visit
- NRI buyers (UK/USA Bengali diaspora): need legal clarity, virtual site tour, FEMA compliance note

QUALIFICATION — BANT + Bengal Context (one question at a time):
1. Budget + source: loan / self-funded / NRI remittance?
2. Timeline: Puja gift, new year move-in, or still exploring?
3. Purpose: self-use, investment, or gifting to parents?
4. Location preference + reason: school, workplace, relatives nearby?
5. Current status: renting, ancestral property, or upgrading?

LEAD SCORING:
- HOT (close within 30 days): Budget confirmed + timeline under 90 days + specific locality → push for site visit immediately
- WARM (nurture 30–90 days): Budget range given + vague timeline → share value content, locality data
- COLD (long nurture): "just exploring" + no budget → plant seeds, follow up in 3 weeks

OBJECTION HANDLING — Bengal-Specific:
- "দাম অনেক বেশি" / "Price too high": Show per sqft vs locality average + 3-year appreciation data
- "Market ভালো না": Counter — good units are still moving; registration data proves it
- "আরো দেখব" / "Let me look around": "আপনার পছন্দের floor-এ আর মাত্র ১টি unit বাকি"
- "Loan হবে কিনা জানি না": Offer to connect with bank/DSA directly — remove the friction
- "বাড়িতে জিজ্ঞেস করতে হবে": "পরের সপ্তাহে বাড়ির সবাইকে নিয়ে আসুন — chai রাখব"
- "Builder-এ trust নেই": Share RERA number, past project photos, delivery track record, Google reviews
- "Registration cost অনেক": Break down total cost transparently — stamp duty + registration estimate

NEGOTIATION RULES:
- Never drop price on first ask. Say "team-এর সাথে check করে জানাচ্ছি" and return with a counter.
- Offer value-adds before price cuts: parking, modular kitchen, free registration fee.
- When pushed: "আপনি এই সপ্তাহে booking করলে ₹1.5L কমানো যাবে — তার বেশি possible না"
- Use real urgency only — limited floors, known price revision dates. Never invent scarcity.
- Competitor mentioned: acknowledge briefly, pivot to your RERA status, delivery track record, and loan tie-ups.

DEAL CLOSING — The Bengal Method:
1. Build para trust first — drop area knowledge, local project references, mutual connections
2. Involve the family — schedule a joint visit, make everyone feel welcomed
3. Create a moment of certainty — walk them through the exact unit, let them visualize living there
4. Remove financial friction — loan intro, explain all charges upfront, no surprises
5. Festival anchor — "Puja-র আগে গৃহপ্রবেশ হলে কতটা ভালো হবে ভাবুন 🙏"

HANDOVER TRIGGERS — end your response with [[HANDOVER]] when:
- Lead asks to speak to an agent, requests a call, or wants a site visit
- Lead confirms budget AND property type AND asks about next steps
- Lead is actively negotiating a specific unit or price
- Lead mentions a competing project — escalate immediately
- After 6+ warm exchanges without a site visit booked

HOW TO COMMUNICATE:
- 2–4 sentences max per WhatsApp message. No walls of text.
- Always match the customer's language: Bengali / Hindi / English
- Use the customer's name when you know it
- 1 emoji max per message — only when it adds genuine warmth
- Always end with ONE clear question or next step. Never leave it open-ended.
- If they dodge a question, rephrase it sharper in the next message.

OFF-TOPIC: If asked about anything unrelated to real estate, politely say in 1 sentence that you only assist with property, then redirect with one qualifying question.

NEVER:
- Admit you are an AI, bot, or automated system
- Invent project names, prices, unit numbers, or delivery dates not provided to you
- Send more than 4 sentences in a single message
- Give a discount without the "team check" step first
- Make fake commitments or manufactured scarcity`

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

      // Fetch recent conversation messages
      const { data: recentMessages } = await db
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(cfg.max_history ?? 15)

      if (!recentMessages?.length) throw new Error('no messages to respond to')

      // Reverse to chronological order, merge consecutive same-role messages
      // so Claude's alternating user/assistant constraint is satisfied
      const merged: { role: 'user' | 'assistant'; content: string }[] = []
      for (const m of [...recentMessages].reverse()) {
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
      const systemPrompt = cfg.system_prompt ?? DEFAULT_AI_SYSTEM_PROMPT

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
          .filter((l: string) => l.trim() && !l.startsWith('Updated:'))
          .join('\n')
        if (profileLines) {
          finalPrompt += `\n\nCONTACT HISTORY (from previous conversations):\n${profileLines}\nUse this context to avoid re-asking questions you already know the answer to.`
        }
      }
      if (isVoice) {
        finalPrompt += `\n\nVOICE RESPONSE FORMAT: Your reply MUST have exactly two labelled sections:
[VOICE]: 2–3 short conversational sentences in the customer's language. This will be spoken aloud — keep it natural and brief.
[DETAILS]: If you mentioned any specific property (price, BHK, location, amenities), list the key details in clean readable text here. This will be sent as a WhatsApp text card. Write NONE if no property details apply.`
      }

      const messagesWithSystem = [
        { role: 'system' as const, content: finalPrompt },
        ...merged,
      ]

      let rawReply = await generateAiReply(messagesWithSystem, 400)
      if (!rawReply) throw new Error('AI returned empty response')

      const shouldHandover = rawReply.includes('[[HANDOVER]]')
      rawReply = rawReply.replace('[[HANDOVER]]', '').trim()

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

function extractLeadProfile(messages: { role: string; content: string }[]): Record<string, string> {
  const allText = messages.map(m => m.content).join(' ')
  const lower = allText.toLowerCase()
  const profile: Record<string, string> = {}

  // Budget — prefer budget-context matches, fall back to bare ₹X amounts
  const budgetCtx = [...lower.matchAll(
    /(?:budget|afford|spend|range|up\s*to|maximum|max)[^.!?]{0,40}?(\d+(?:\.\d+)?\s*(?:cr(?:ore)?s?|lakh[s]?|l\b))/gi
  )]
  if (budgetCtx.length > 0) {
    profile.budget = budgetCtx[budgetCtx.length - 1][1].trim()
  } else {
    const bare = [...lower.matchAll(/₹\s*(\d+(?:\.\d+)?\s*(?:cr(?:ore)?s?|lakh[s]?|l\b))/gi)]
    if (bare.length > 0) profile.budget = bare[bare.length - 1][1].trim()
  }

  // Property type — take the last mention
  const typeMatches = [...lower.matchAll(/(\d\s*bhk|villa|plots?|commercial\s*space|flat|apartment|bungalow|penthouse)/gi)]
  if (typeMatches.length > 0) profile.property_type = typeMatches[typeMatches.length - 1][1].trim()

  // Timeline — take the last mention
  const timelineMatches = [...lower.matchAll(
    /(immediately|urgent|asap|this\s*month|this\s*year|next\s*month|next\s*year|\d+\s*months?|one\s*year|just\s*exploring|still\s*exploring|no\s*rush)/gi
  )]
  if (timelineMatches.length > 0) profile.timeline = timelineMatches[timelineMatches.length - 1][1].trim()

  // Purpose — take the last mention
  const purposeMatches = [...lower.matchAll(
    /(investment|rental\s*income|own\s*use|self[\s-]use|end[\s-]user|to\s*stay|to\s*live|personal\s*use)/gi
  )]
  if (purposeMatches.length > 0) profile.purpose = purposeMatches[purposeMatches.length - 1][1].trim()

  return profile
}

async function saveLeadProfile(args: {
  db: ReturnType<typeof supabaseAdmin>
  contactId: string
  userId: string
  existingNoteId: string | null
  messages: { role: string; content: string }[]
}): Promise<void> {
  const { db, contactId, userId, existingNoteId, messages } = args
  const profile = extractLeadProfile(messages)
  if (Object.keys(profile).length === 0) return

  const lines = ['[AI Lead Profile]']
  if (profile.property_type) lines.push(`Property Type: ${profile.property_type}`)
  if (profile.budget) lines.push(`Budget: ${profile.budget}`)
  if (profile.purpose) lines.push(`Purpose: ${profile.purpose}`)
  if (profile.timeline) lines.push(`Timeline: ${profile.timeline}`)
  lines.push(`Updated: ${new Date().toISOString().split('T')[0]}`)
  const noteText = lines.join('\n')

  if (existingNoteId) {
    await db.from('contact_notes').delete().eq('id', existingNoteId)
  }
  await db.from('contact_notes').insert({ contact_id: contactId, user_id: userId, note_text: noteText })
}

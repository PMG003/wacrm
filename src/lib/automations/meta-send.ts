import { sendTextMessage, sendTemplateMessage, uploadMedia, sendAudioMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import { supabaseAdmin } from './admin-client'

// ------------------------------------------------------------
// Automation-side Meta sender.
//
// Mirrors the logic in src/app/api/whatsapp/send/route.ts but uses
// the service-role client (engine has no cookies) and accepts the
// user / conversation / contact identifiers the engine already has
// on hand. Kept here (rather than refactoring the user-facing send
// route) to avoid risk to the working manual-send path — they can
// converge in a later refactor.
// ------------------------------------------------------------

interface SendTextArgs {
  userId: string
  conversationId: string
  contactId: string
  text: string
}

interface SendTemplateArgs {
  userId: string
  conversationId: string
  contactId: string
  templateName: string
  language?: string
  params?: string[]
}

export async function engineSendText(args: SendTextArgs): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'text' })
}

export async function engineSendTemplate(
  args: SendTemplateArgs,
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'template' })
}

type SendInput =
  | (SendTextArgs & { kind: 'text' })
  | (SendTemplateArgs & { kind: 'template' })

async function sendViaMeta(input: SendInput): Promise<{ whatsapp_message_id: string }> {
  const db = supabaseAdmin()

  // Scope the contact lookup by user_id. The engine uses the
  // service-role client (bypassing RLS), and the public
  // /api/automations/engine endpoint accepts contact_id from the
  // request body — without this filter, an authenticated user could
  // fire their own automations against another tenant's contact UUID
  // and send via their own WhatsApp config to that contact's phone.
  // Practical risk is low (UUIDs are unguessable) but the check is
  // cheap defense-in-depth.
  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (contactErr || !contact?.phone) {
    throw new Error('contact not found for this user')
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new Error(`contact phone invalid: ${contact.phone}`)
  }

  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('user_id', input.userId)
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  const accessToken = decrypt(config.access_token)

  const attempt = async (phone: string): Promise<string> => {
    if (input.kind === 'template') {
      const r = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: input.templateName,
        language: input.language,
        params: input.params,
      })
      return r.messageId
    }
    const r = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: input.text,
    })
    return r.messageId
  }

  // Same phone-variant retry as /api/whatsapp/send — Meta sandbox and
  // numbers registered with/without a trunk 0 both require this to
  // reliably land a message.
  const variants = phoneVariants(sanitized)
  let workingPhone = sanitized
  let waMessageId = ''
  let lastError: unknown = null
  for (const v of variants) {
    try {
      waMessageId = await attempt(v)
      workingPhone = v
      lastError = null
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isRecipientNotAllowedError(msg)) throw err
      lastError = err
    }
  }
  if (lastError) throw lastError

  if (workingPhone !== sanitized) {
    await db.from('contacts').update({ phone: workingPhone }).eq('id', contact.id)
  }

  // Persist the sent message so it appears in the inbox with a real
  // Meta message id. sender_type='bot' distinguishes automation sends
  // from manual agent sends.
  const content_type = input.kind === 'template' ? 'template' : 'text'
  const content_text = input.kind === 'text' ? input.text : null
  const template_name = input.kind === 'template' ? input.templateName : null

  const { error: msgErr } = await db.from('messages').insert({
    conversation_id: input.conversationId,
    sender_type: 'bot',
    content_type,
    content_text,
    template_name,
    message_id: waMessageId,
    status: 'sent',
  })
  if (msgErr) {
    // Meta already has the message; record the DB error but don't pretend
    // the send failed. The engine wraps this in a log line.
    throw new Error(`sent to Meta but DB insert failed: ${msgErr.message}`)
  }

  await db
    .from('conversations')
    .update({
      last_message_text:
        input.kind === 'template' ? `[template:${input.templateName}]` : input.text,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)

  return { whatsapp_message_id: waMessageId }
}

/**
 * Convert text to speech via the wacrm-ai service, upload the audio to
 * Meta, and send it as a voice message. Falls back to a text message if
 * the AI service is unavailable so the conversation never goes silent.
 */
export async function engineSendAudio(args: {
  userId: string
  conversationId: string
  contactId: string
  text: string
  /** ISO 639-1 language code to pass to TTS (e.g. "hi", "en"). Defaults to "en". */
  voice?: string
}): Promise<{ whatsapp_message_id: string; sent_as: 'audio' | 'text' }> {
  const db = supabaseAdmin()

  const { data: contact } = await db
    .from('contacts')
    .select('id, phone')
    .eq('id', args.contactId)
    .eq('user_id', args.userId)
    .maybeSingle()
  if (!contact?.phone) throw new Error('contact not found for this user')

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) throw new Error(`contact phone invalid: ${contact.phone}`)

  const { data: config } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('user_id', args.userId)
    .single()
  if (!config) throw new Error('WhatsApp not configured for this account')

  const accessToken = decrypt(config.access_token)

  // Try TTS → audio send
  const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://wacrm-ai:8001'
  try {
    const ttsRes = await fetch(`${aiServiceUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: args.text, voice: args.voice ?? 'en' }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!ttsRes.ok) throw new Error(`TTS ${ttsRes.status}`)

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer())
    const mediaId = await uploadMedia({
      phoneNumberId: config.phone_number_id,
      accessToken,
      buffer: audioBuffer,
      mimeType: 'audio/mpeg',
    })
    const { messageId } = await sendAudioMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: sanitized,
      mediaId,
    })

    // Persist — content_text stores the transcript so agents can read it
    await db.from('messages').insert({
      conversation_id: args.conversationId,
      sender_type: 'bot',
      content_type: 'audio',
      content_text: args.text,
      message_id: messageId,
      status: 'sent',
    })
    await db.from('conversations').update({
      last_message_text: '🎤 Voice message',
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', args.conversationId)

    return { whatsapp_message_id: messageId, sent_as: 'audio' }
  } catch (err) {
    // TTS failed — fall back to text so the lead still gets a reply
    console.error('[engineSendAudio] TTS/upload failed, falling back to text:', err)
    const { whatsapp_message_id } = await engineSendText({
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: args.text,
    })
    return { whatsapp_message_id, sent_as: 'text' }
  }
}

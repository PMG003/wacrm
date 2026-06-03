/**
 * Universal lead webhook — handles IndiaMart, JustDial, and generic POST leads.
 *
 * URL: POST /api/webhooks/leads?token=WEBHOOK_TOKEN&source=indiamart|justdial|generic
 *
 * The WEBHOOK_TOKEN is stored in whatsapp_config.webhook_token for each user.
 * Users find their webhook URL in Settings → WhatsApp Config.
 *
 * IndiaMart sends form-encoded POST:
 *   name, mobile, email, query, city, sender_mobile
 *
 * JustDial sends JSON POST:
 *   contact_no, name, email, category, area, city, message, leadid
 *
 * Generic: any JSON with phone/mobile/contact_no + name fields.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

function extractLeadFields(body: Record<string, string>, source: string) {
  if (source === 'justdial') {
    return {
      phone: (body.contact_no ?? body.phone ?? '').replace(/\D/g, ''),
      name: body.name ?? body.prefixname ?? '',
      email: body.email ?? '',
      query: body.message ?? body.category ?? '',
      city: body.city ?? body.area ?? '',
    }
  }
  // IndiaMart + generic
  return {
    phone: (body.mobile ?? body.sender_mobile ?? body.phone ?? body.contact_no ?? '').replace(/\D/g, ''),
    name: body.name ?? body.sender_name ?? '',
    email: body.email ?? '',
    query: body.query ?? body.message ?? body.subject ?? '',
    city: body.city ?? body.location ?? '',
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const source = (searchParams.get('source') ?? 'generic').toLowerCase()

  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const db = supabaseAdmin()

  // Find user by webhook token
  const { data: config } = await db
    .from('whatsapp_config')
    .select('user_id, org_id')
    .eq('webhook_token', token)
    .maybeSingle()

  if (!config?.user_id) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  const { user_id, org_id } = config

  // Parse body — handle both JSON and form-encoded
  let body: Record<string, string> = {}
  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      body = await req.json()
    } else {
      const text = await req.text()
      for (const pair of text.split('&')) {
        const [k, v] = pair.split('=').map(decodeURIComponent)
        if (k) body[k] = v ?? ''
      }
    }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { phone, name, email, query, city } = extractLeadFields(body, source)

  if (!phone || phone.length < 7) {
    return NextResponse.json({ error: 'no valid phone number in payload' }, { status: 400 })
  }

  // Normalize to E.164 — prefix 91 for Indian numbers missing country code
  const e164 = phone.startsWith('91') && phone.length === 12
    ? phone
    : phone.length === 10
      ? `91${phone}`
      : phone

  // Upsert contact (phone-based dedup)
  const { data: existing } = await db
    .from('contacts')
    .select('id')
    .eq('user_id', user_id)
    .eq('phone', e164)
    .maybeSingle()

  let contactId: string

  if (existing?.id) {
    contactId = existing.id
  } else {
    const { data: created, error } = await db
      .from('contacts')
      .insert({
        user_id,
        ...(org_id ? { org_id } : {}),
        phone: e164,
        name: name || e164,
        email: email || null,
        company: city || null,
      })
      .select('id')
      .single()

    if (error || !created) {
      console.error('[leads webhook] contact insert failed:', error)
      return NextResponse.json({ error: 'failed to create contact' }, { status: 500 })
    }
    contactId = created.id
  }

  // Ensure a conversation exists
  const { data: conv } = await db
    .from('conversations')
    .select('id')
    .eq('user_id', user_id)
    .eq('contact_id', contactId)
    .maybeSingle()

  let conversationId: string

  if (conv?.id) {
    conversationId = conv.id
  } else {
    const { data: newConv, error } = await db
      .from('conversations')
      .insert({
        user_id,
        ...(org_id ? { org_id } : {}),
        contact_id: contactId,
        status: 'open',
      })
      .select('id')
      .single()

    if (error || !newConv) {
      console.error('[leads webhook] conversation insert failed:', error)
      return NextResponse.json({ error: 'failed to create conversation' }, { status: 500 })
    }
    conversationId = newConv.id
  }

  // Insert the lead query as an inbound message so it appears in inbox
  if (query) {
    await db.from('messages').insert({
      conversation_id: conversationId,
      contact_id: contactId,
      sender_type: 'customer',
      content_type: 'text',
      content_text: `[${source.toUpperCase()} Lead] ${query}${city ? ` | City: ${city}` : ''}`,
      status: 'delivered',
    })
  }

  // Fire automation — first_inbound_message triggers A1 (greeting), new_message_received triggers A2 (AI)
  runAutomationsForTrigger({
    userId: user_id,
    triggerType: 'first_inbound_message',
    contactId,
    context: {
      message_text: query,
      conversation_id: conversationId,
      input_type: 'text',
      input_language: 'en',
      org_id: org_id ?? undefined,
    },
  }).catch(err => console.error('[leads webhook] automation dispatch failed:', err))

  console.log(`[leads webhook] ${source} lead imported: ${e164} (${name}) → contact ${contactId}`)
  return NextResponse.json({ success: true, contact_id: contactId, source })
}

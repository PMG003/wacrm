import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('org_ai_config')
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const { data: member } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member?.org_id) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 400 })
  }

  const payload = {
    org_id: member.org_id,
    agent_name: body.agent_name || 'Riya',
    company_name: body.company_name || '',
    company_about: body.company_about || null,
    service_areas: body.service_areas || [],
    languages: body.languages || ['en'],
    agent_tone: body.agent_tone || 'professional',
    active_listings: body.active_listings || null,
    custom_system_prompt: body.custom_system_prompt || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('org_ai_config')
    .upsert(payload, { onConflict: 'org_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}

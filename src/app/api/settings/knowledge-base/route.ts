import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('org_knowledge_base')
    .select('id, filename, file_type, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member?.org_id) return NextResponse.json({ error: 'No organisation found' }, { status: 400 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })

  const allowedTypes = ['application/pdf', 'text/plain']
  if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF and TXT files are supported' }, { status: 400 })
  }

  // Upload to Supabase Storage
  const filePath = `${member.org_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('knowledge-base')
    .upload(filePath, bytes, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Extract text content
  let contentText = ''
  try {
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      contentText = await file.text()
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // pdf-parse ships CJS; require avoids ESM default-export mismatch
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
      const buffer = Buffer.from(bytes)
      const parsed = await pdfParse(buffer)
      contentText = parsed.text
    }
  } catch (err) {
    console.error('[knowledge-base] text extraction failed:', err)
    contentText = ''
  }

  const { data, error } = await supabase
    .from('org_knowledge_base')
    .insert({
      org_id: member.org_id,
      user_id: user.id,
      filename: file.name,
      file_path: filePath,
      file_type: file.name.endsWith('.pdf') ? 'pdf' : 'txt',
      content_text: contentText || null,
    })
    .select('id, filename, file_type, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data }, { status: 201 })
}

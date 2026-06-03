import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: doc } = await supabase
    .from('org_knowledge_base')
    .select('file_path')
    .eq('id', id)
    .maybeSingle()

  if (doc?.file_path) {
    await supabase.storage.from('knowledge-base').remove([doc.file_path])
  }

  const { error } = await supabase
    .from('org_knowledge_base')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

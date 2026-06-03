import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAiReply } from '@/lib/automations/ai-provider'

const EXTRACTION_PROMPT = `You are a real estate listing extractor. The user has copy-pasted raw text from an Indian property portal (MagicBricks, 99acres, Housing.com, NoBroker, PropTiger, etc.).

Extract ALL property listings from the text and format each as a clean block.

OUTPUT FORMAT — one block per property, blank line between multiple:
[EMOJI] [BHK/Type] — [Locality], [City]
  • Size: [X sq ft] | [Sale/Rent]: ₹[price]
  • [feature 1] | [feature 2] | [feature 3]
  • Builder: [name] | RERA: [number if present]
  • Status: [Ready/Under Construction] | Possession: [date if mentioned]
  • [any other key detail]

Rules:
- Use 🏢 for commercial (office, shop, warehouse, coworking)
- Use 🏠 for residential (flat, apartment, villa, house, plot)
- Use ₹ for all prices. Convert lakhs (L/Lac/Lakh) and crores (Cr/Crore) to symbols (₹85L, ₹1.2Cr)
- If rent: write "Rent: ₹X/month". If sale: write "Price: ₹X"
- Include RERA registration number if present — it builds trust
- If multiple listings are in the text, extract ALL of them
- Output ONLY the formatted blocks. No explanation, no preamble, no markdown headers.
- If no property data found, output exactly: NO_LISTING_FOUND`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  if (text.length > 20000) return NextResponse.json({ error: 'Text too long (max 20,000 chars)' }, { status: 400 })

  const result = await generateAiReply(
    [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: text.trim() },
    ],
    600,
  )

  if (!result || result.trim() === 'NO_LISTING_FOUND') {
    return NextResponse.json({ error: 'No property details found in the text. Try copying more of the listing page.' }, { status: 422 })
  }

  return NextResponse.json({ listing: result.trim() })
}

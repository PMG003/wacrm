import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Convert a Google Sheets edit/share URL to CSV export URL
function toCsvUrl(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('Invalid Google Sheets URL')
  const id = match[1]
  const gidMatch = url.match(/[#&]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}

function parsePrice(val: string): string {
  if (!val || val.trim() === '' || val.trim().toUpperCase() === 'NA') return ''
  return val.trim().replace(/\/-$/, '').trim()
}

function formatListings(csv: string): string {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return ''

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const idx = (name: string) => headers.findIndex(h => h.includes(name))

  const iBuilder   = idx('builder')
  const iLocality  = idx('locality')
  const iBhk       = idx('bhk')
  const iSell      = idx('sell')
  const iRent      = idx('rent')
  const iType      = idx('type')
  const iStatus    = idx('status')
  const iPossess   = idx('possession')
  const iDesc      = idx('description')

  const rows: string[] = []

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields with commas inside
    const cols: string[] = []
    let cur = ''
    let inQuote = false
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    cols.push(cur.trim())

    const get = (i: number) => (i >= 0 ? (cols[i] ?? '').replace(/^"|"$/g, '').trim() : '')

    const builder  = get(iBuilder)
    const locality = get(iLocality)
    const size     = get(iBhk)
    const sell     = parsePrice(get(iSell))
    const rent     = parsePrice(get(iRent))
    const type     = get(iType)
    const status   = get(iStatus)
    const possess  = get(iPossess)
    const desc     = get(iDesc)

    // Skip empty rows
    if (!builder && !locality) continue

    const emoji = sell && sell !== '' ? '🏢' : '🏠'
    let block = `${emoji} ${builder}${locality ? ` — ${locality}` : ''}`
    const details: string[] = []
    if (size)    details.push(`Size: ${size}`)
    if (rent)    details.push(`Rent: ₹${rent}/month`)
    if (sell)    details.push(`Sale: ₹${sell}`)
    if (type)    details.push(type)
    if (status)  details.push(`Status: ${status}`)
    if (possess) details.push(`Possession: ${possess}`)
    if (details.length) block += `\n  • ${details.join(' | ')}`
    if (desc)    block += `\n  • ${desc}`

    rows.push(block)
  }

  return rows.join('\n\n')
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  let csvUrl: string
  try { csvUrl = toCsvUrl(url) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

  // Follow redirects manually — Google Sheets CSV export 307s to googleusercontent.com
  let response = await fetch(csvUrl, { redirect: 'follow' })
  if (!response.ok) return NextResponse.json({ error: `Sheet fetch failed: ${response.status}` }, { status: 502 })

  const csv = await response.text()
  const listings = formatListings(csv)

  return NextResponse.json({ listings })
}

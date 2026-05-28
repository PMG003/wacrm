// ---------------------------------------------------------------------------
// AI Provider abstraction — zero new npm packages, uses fetch.
//
// Set AI_PROVIDER in your .env:
//   AI_PROVIDER=ollama   → Ollama running on the VPS host (free, local)
//   AI_PROVIDER=groq     → Groq cloud free-tier API (fast, free 14k req/day)
//
// Ollama env vars:
//   OLLAMA_BASE_URL=http://host.docker.internal:11434   (Docker → host)
//   AI_MODEL=gemma2:2b                                  (or llama3.2:3b)
//
// Groq env vars:
//   GROQ_API_KEY=gsk_...
//   AI_MODEL=gemma2-9b-it                               (or llama-3.1-8b-instant)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function generateAiReply(
  messages: ChatMessage[],
  maxTokens = 400,
): Promise<string> {
  const provider = (process.env.AI_PROVIDER ?? 'ollama').toLowerCase()

  if (provider === 'groq') return callGroq(messages, maxTokens)
  return callOllama(messages, maxTokens)
}

// ---------------------------------------------------------------------------
// Ollama  (local, zero cost — install once on VPS with `curl -fsSL https://ollama.com/install.sh | sh`)
// Pull model once: `ollama pull gemma2:2b`
// ---------------------------------------------------------------------------
async function callOllama(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const base = (process.env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434').replace(/\/$/, '')
  const model = process.env.AI_MODEL ?? 'gemma2:2b'

  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false }),
    // 90-second timeout — CPU inference with 3B models can be slow on first call
    signal: AbortSignal.timeout(90_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('Ollama returned empty response')
  return text
}

// ---------------------------------------------------------------------------
// Groq  (free tier — sign up at groq.com, no credit card needed)
// Free: ~14,400 requests/day on gemma2-9b-it / llama-3.1-8b-instant
// ---------------------------------------------------------------------------
async function callGroq(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set in environment')

  const model = process.env.AI_MODEL ?? 'gemma2-9b-it'

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('Groq returned empty response')
  return text
}

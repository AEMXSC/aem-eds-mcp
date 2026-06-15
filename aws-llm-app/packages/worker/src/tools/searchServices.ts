import { type ServiceRecord, type ServiceSummary, type Env } from '../types.js'

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '#'
}

const CATEGORY_EMOJI: Record<string, string> = {
  Compute: '⚡', Containers: '🐳', 'AI/ML': '🤖', Storage: '🗄️',
  Database: '🗃️', Networking: '🌐', Security: '🔐', Observability: '📊',
  DevTools: '🛠️', Messaging: '📨', Orchestration: '🔄',
}

export function renderCardsHtml(results: ServiceSummary[], query: string): string {
  const cards = results.map((s, i) => {
    const isTop = i === 0
    const isTrending = s.demand_label.includes('Trending')
    const demandCls = isTrending ? 'demand-trending' : s.demand_label.includes('High') || s.demand_label.includes('Moderate') ? 'demand-high' : 'demand-niche'
    const emoji = CATEGORY_EMOJI[s.category] ?? '☁️'
    return `<div class="aws-card${isTop ? ' top' : ''}">
      ${isTop ? '<div class="aws-top-badge">Top match</div>' : ''}
      <div class="aws-card-header">
        <div class="aws-icon">${emoji}</div>
        <div class="aws-card-title"><h3>${esc(s.name)}</h3><p>${esc(s.category.toUpperCase())}</p></div>
      </div>
      <div class="aws-desc">${esc(s.tagline)}</div>
      <div class="aws-relevance">${esc(s.relevance_reason)}</div>
      <div class="aws-footer">
        <span class="aws-demand ${demandCls}">${esc(s.demand_label)}</span>
        <span class="aws-volume">${esc(s.search_volume_formatted)} searches/mo</span>
        <a class="aws-learn" href="${safeUrl(s.cta_url)}" target="_blank">Learn more ↗</a>
        <a class="aws-llo" href="https://business.adobe.com/au/products/llm-optimizer.html" target="_blank">
          <div class="aws-llo-label">Powered by<strong>LLM Optimizer</strong></div>
          <svg width="18" height="18" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M60.4 5H95v90L60.4 5z" fill="#E1251B"/><path d="M39.6 5H5v90L39.6 5z" fill="#E1251B"/><path d="M50 50.2L65.8 95H52.7l-4.4-13.2H35.9L50 50.2z" fill="#E1251B"/></svg>
        </a>
      </div>
    </div>`
  }).join('')

  return `<style>
    *{box-sizing:border-box;margin:0;padding:0}
    .aws-search{font-family:-apple-system,"Helvetica Neue",sans-serif;padding:20px;background:#111;border-radius:12px}
    .aws-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
    .aws-logo{display:flex;align-items:center;gap:10px}
    .aws-logo-mark{background:#FF9900;color:#000;font-weight:900;font-size:11px;padding:4px 7px;border-radius:4px;letter-spacing:1px}
    .aws-logo-text{color:#fff;font-size:15px;font-weight:600}
    .aws-pill{background:#FF990020;border:1px solid #FF9900;color:#FF9900;padding:5px 14px;border-radius:20px;font-size:12px}
    .aws-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
    .aws-card{background:#1e1e1e;border:1px solid #333;border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px;position:relative}
    .aws-card.top{border-color:#FF9900;border-width:2px}
    .aws-top-badge{position:absolute;top:14px;right:14px;background:#FF9900;color:#000;font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px}
    .aws-card-header{display:flex;align-items:center;gap:10px}
    .aws-icon{width:36px;height:36px;background:#fff;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .aws-card-title h3{color:#fff;font-size:16px;font-weight:700;margin-bottom:2px}
    .aws-card-title p{color:#777;font-size:10px;font-weight:600;letter-spacing:1px}
    .aws-desc{color:#bbb;font-size:13px;line-height:1.5}
    .aws-relevance{color:#666;font-size:11px;font-style:italic}
    .aws-footer{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:10px;border-top:1px solid #333;flex-wrap:wrap}
    .aws-demand{font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;white-space:nowrap}
    .demand-high,.demand-trending{background:#0a1f0a;color:#4ade80}
    .demand-niche{background:#1a1a1a;color:#666}
    .aws-volume{color:#666;font-size:11px;flex:1;white-space:nowrap}
    .aws-learn{color:#FF9900;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap}
    .aws-llo{display:flex;align-items:center;gap:4px;text-decoration:none;opacity:.65;margin-left:auto}
    .aws-llo:hover{opacity:1}
    .aws-llo-label{font-size:8px;color:#777;line-height:1.3;text-align:right}
    .aws-llo-label strong{display:block;font-size:9px;color:#E1251B;font-weight:700}
  </style>
  <div class="aws-search">
    <div class="aws-header">
      <div class="aws-logo"><div class="aws-logo-mark">AWS</div><div class="aws-logo-text">Service Search</div></div>
      <div class="aws-pill">${esc(query)}</div>
    </div>
    <div class="aws-grid">${cards}</div>
  </div>`
}

const SEMRUSH_MCP = 'https://mcp.semrush.com/claude/v1/mcp'

function scoreService(
  service: ServiceRecord,
  queryTokens: string[],
  liveKeywords: string[]
): number {
  let score = 0

  queryTokens.forEach(token => {
    if (service.use_cases.some(uc => uc.toLowerCase().includes(token))) score += 3
    if (service.tagline.toLowerCase().includes(token)) score += 2
    if (service.description.toLowerCase().includes(token)) score += 1
    if (service.top_keywords.some(kw => kw.toLowerCase().includes(token))) score += 2
  })

  score += Math.log10(Math.max(service.search_volume, 1)) * 0.5
  if (service.search_volume_trend === 'up') score += 1.5
  if (service.search_volume_change_pct > 20) score += 1.0

  liveKeywords.forEach(lk => {
    if (service.top_keywords.some(kw => kw.toLowerCase().includes(lk.toLowerCase()))) score += 2
    if (service.name.toLowerCase().includes(lk.toLowerCase())) score += 1.5
  })

  return score
}

function buildDemandLabel(s: ServiceRecord): string {
  const level =
    s.search_volume > 40000 ? 'High demand'
    : s.search_volume > 10000 ? 'Moderate demand'
    : 'Niche'
  const trend =
    s.search_volume_trend === 'up' ? ` · Trending +${s.search_volume_change_pct}%`
    : s.search_volume_trend === 'down' ? ' · Declining'
    : ' · Stable'
  return level + trend
}

function formatVolume(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

async function getLiveSemrushKeywords(query: string, apiKey: string, kv: KVNamespace): Promise<string[]> {
  const cacheKey = `cache:semrush:${query.toLowerCase().trim().slice(0, 100)}`
  const cached = await kv.get<string[]>(cacheKey, 'json')
  if (cached) return cached

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        mcp_servers: [{ type: 'url', url: SEMRUSH_MCP, name: 'semrush' }],
        messages: [
          {
            role: 'user',
            content: `Call semrush keyword_research for "${query}". Return ONLY a JSON array of the top 5 keyword strings. No explanation.`,
          },
        ],
      }),
    })
    const data = await res.json() as Record<string, unknown>
    const content = Array.isArray(data.content) ? data.content : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text: string = content.find((b: any) => b.type === 'text')?.text ?? '[]'
    let keywords: string[] = []
    try {
      keywords = JSON.parse(text.replace(/```json|```/g, '').trim()) as string[]
    } catch {
      keywords = []
    }
    if (keywords.length) {
      // Fire-and-forget: don't block the response on the write
      void kv.put(cacheKey, JSON.stringify(keywords), { expirationTtl: 86400 })
    }
    return keywords
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

export async function searchServices(
  query: string,
  env: Env,
  category?: string,
  limit = 4
): Promise<ServiceSummary[]> {
  // Result-level cache: identical queries skip all work (~5 ms vs ~4 s)
  const resultCacheKey = `cache:search:${query.toLowerCase().trim().slice(0, 100)}:${category ?? '_'}:${limit}`
  const cachedResult = await env.AWS_SERVICES.get<ServiceSummary[]>(resultCacheKey, 'json')
  if (cachedResult) return cachedResult

  const ids = await env.AWS_SERVICES.get<string[]>('index:all', 'json')
  if (!ids || ids.length === 0) return []

  // Fetch all records and live keywords in parallel
  const [records, liveKeywords] = await Promise.all([
    Promise.all(
      ids.map(id => env.AWS_SERVICES.get<ServiceRecord>(`service:${id}`, 'json'))
    ),
    getLiveSemrushKeywords(query, env.ANTHROPIC_API_KEY, env.AWS_SERVICES),
  ])

  const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)

  const scored = records
    .filter((r): r is ServiceRecord => r !== null)
    .filter(r => !category || r.category === category)
    .map(r => ({ record: r, score: scoreService(r, queryTokens, liveKeywords) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const results: ServiceSummary[] = scored.map(({ record: r, score }) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    tagline: r.tagline,
    relevance_reason: score > 5
      ? `Matches key workload terms in ${r.category.toLowerCase()} category`
      : `Relevant ${r.category} service for your use case`,
    demand_label: buildDemandLabel(r),
    search_volume_formatted: formatVolume(r.search_volume),
    top_keywords: r.top_keywords,
    cta_url: r.cta_url,
  }))

  // Cache result for 1 hour; fire-and-forget
  void env.AWS_SERVICES.put(resultCacheKey, JSON.stringify(results), { expirationTtl: 3600 })
  return results
}

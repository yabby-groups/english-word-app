const DEFAULT_TIMEOUT_MS = 8000;

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function normalizeResults(results, maxResults) {
  return results
    .filter((item) => item?.title && item?.url && item?.snippet)
    .slice(0, maxResults)
    .map((item) => ({
      title: String(item.title).slice(0, 240),
      url: String(item.url),
      snippet: String(item.snippet).slice(0, 600),
    }));
}

async function request(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': 'Echo Voicechat/1.0', ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function searchDuckDuckGo(query, maxResults, timeoutMs) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await (await request(url, {}, timeoutMs)).text();
  const results = [];
  const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const rawUrl = decodeHtml(match[1]);
    const parsedUrl = rawUrl.match(/[?&]uddg=([^&]+)/)?.[1];
    results.push({
      title: decodeHtml(match[2]),
      url: parsedUrl ? decodeURIComponent(parsedUrl) : rawUrl,
      snippet: decodeHtml(match[3]),
    });
  }
  return normalizeResults(results, maxResults);
}

export function parseBingSearchResults(html, maxResults) {
  const results = [];
  const blocks = String(html).match(/<li class="b_algo"[\s\S]*?<\/li>/g) || [];
  for (const block of blocks) {
    const heading = block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/);
    const snippet = block.match(/<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
    if (!heading || !snippet) continue;
    results.push({ url: decodeHtml(heading[1]), title: decodeHtml(heading[2]), snippet: decodeHtml(snippet[1]) });
  }
  return normalizeResults(results, maxResults);
}

async function searchBing(query, maxResults, timeoutMs) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const html = await (await request(url, { headers: { 'Accept-Language': 'en-US,en;q=0.8' } }, timeoutMs)).text();
  return parseBingSearchResults(html, maxResults);
}

async function searchTavily(query, apiKey, maxResults, timeoutMs) {
  const response = await request('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: maxResults, include_answer: false }),
  }, timeoutMs);
  const data = await response.json();
  return normalizeResults(data.results || [], maxResults);
}

async function searchBrave(query, apiKey, maxResults, timeoutMs) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const response = await request(url, { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' } }, timeoutMs);
  const data = await response.json();
  return normalizeResults((data.web?.results || []).map((item) => ({
    title: item.title, url: item.url, snippet: item.description,
  })), maxResults);
}

async function searchBowApi(query, searchUrl, maxResults, timeoutMs, searchMode = 'fast') {
  if (!searchUrl) throw new Error('BOWAPI_SEARCH_URL is not configured.');
  const url = new URL(searchUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.min(maxResults, 5)));
  const data = await (await request(url.toString(), {}, timeoutMs)).json();
  if (Array.isArray(data.results)) {
    return normalizeResults(data.results.map((result) => ({
      ...result,
      snippet: result.snippet || `百度搜索结果：${result.title}`,
    })), maxResults);
  }
  const merged = data.answer ? [{
    title: 'BowAPI AI 综合结果',
    url: url.toString(),
    snippet: data.answer,
  }] : [];
  const sources = (data.sources || []).map((source) => ({
    title: source.title,
    url: source.url,
    snippet: '该网页已由 BowAPI 抓取并用于综合回答。',
  }));
  return normalizeResults([...merged, ...sources], maxResults + 1);
}

export function shouldSearchWeb(text, mode = 'auto') {
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  return /\b(latest|recent|today|now|news|weather|price|stock|exchange rate|search|look up|who is|when is)\b|最新|最近|今天|现在|新闻|天气|价格|股价|汇率|搜索|查一下|联网|官网|实时/i.test(text);
}

export async function searchWeb(query, { provider = 'duckduckgo', apiKey, searchUrl, deepSearchUrl, searchMode = 'fast', maxResults = 5, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (provider === 'bowapi') return searchBowApi(query, searchMode === 'deep' ? deepSearchUrl : searchUrl, maxResults, timeoutMs, searchMode);
  if (provider === 'bing') return searchBing(query, maxResults, timeoutMs);
  if (provider === 'tavily') {
    if (!apiKey) throw new Error('WEB_SEARCH_API_KEY is required for Tavily.');
    return searchTavily(query, apiKey, maxResults, timeoutMs);
  }
  if (provider === 'brave') {
    if (!apiKey) throw new Error('WEB_SEARCH_API_KEY is required for Brave Search.');
    return searchBrave(query, apiKey, maxResults, timeoutMs);
  }
  return searchDuckDuckGo(query, maxResults, timeoutMs);
}

export function formatSearchContext(results) {
  if (!results?.length) return '';
  return [
    'Fresh web research is available below. Use it when answering the user, distinguish facts from uncertainty, and cite relevant sources as [1], [2]. Do not invent details that are not supported by these sources.',
    ...results.map((result, index) => `[${index + 1}] ${result.title}\nURL: ${result.url}\n${result.snippet}`),
  ].join('\n\n');
}

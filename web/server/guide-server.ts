// AI 길안내 서버 — Vercel 함수(api/guide.ts)를 EC2·Docker에서 그대로 실행하는 래퍼
//
//   npm run build:server   →  dist-server/guide-server.mjs
//   node dist-server/guide-server.mjs   (PORT 기본 3000)
//
// POST /api/guide 만 처리하고, 공개 URL에서 LLM 비용이 새지 않도록 IP별·일일 호출 한도를 둔다.
// 한도를 넘으면 LLM을 부르지 않고 규칙 기반 폴백으로 답한다 (사용자 경험은 그대로).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { POST } from '../api/guide';

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY = 4 * 1024;
/** IP 하나가 1분에 보낼 수 있는 요청 수 */
const PER_IP_PER_MIN = Number(process.env.GUIDE_RATE_PER_MIN ?? 20);
/** 하루 전체 LLM 호출 상한. 넘으면 그날은 폴백만 쓴다. */
const DAILY_LLM_LIMIT = Number(process.env.GUIDE_DAILY_LIMIT ?? 2000);

const hits = new Map<string, { start: number; count: number }>();
let day = new Date().toISOString().slice(0, 10);
let llmCalls = 0;
const apiKey = process.env.ANTHROPIC_API_KEY;

function clientIp(req: IncomingMessage): string {
  // 앞단 Caddy가 붙여 주는 X-Forwarded-For의 첫 주소
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > 60_000) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  h.count += 1;
  return h.count > PER_IP_PER_MIN;
}

/**
 * 오늘 LLM 호출 한도를 센다. 한도를 넘으면 그날은 키를 환경변수에서 빼서
 * guide.ts가 규칙 기반 폴백으로 답하게 하고, 날짜가 바뀌면 되돌린다.
 */
function updateQuota(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    llmCalls = 0;
    if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
  }
  if (!apiKey) return;
  if (llmCalls >= DAILY_LLM_LIMIT) {
    if (process.env.ANTHROPIC_API_KEY) console.warn('[guide-server] 일일 LLM 한도 도달 → 폴백만 사용');
    delete process.env.ANTHROPIC_API_KEY;
    return;
  }
  llmCalls += 1;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/healthz') return send(res, 200, { status: 'ok', llm: Boolean(apiKey) });
  if (path !== '/api/guide') return send(res, 404, { error: 'not found' });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (limited(clientIp(req))) return send(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });

  const body = await readBody(req);
  if (body === null) return send(res, 413, { error: '요청이 너무 큽니다.' });

  updateQuota();
  try {
    const response = await POST(
      new Request(`http://localhost${req.url}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
    );
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(await response.text());
  } catch (err) {
    console.error('[guide-server]', err);
    send(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`[guide-server] :${PORT} (LLM ${apiKey ? '사용' : '미설정 → 규칙 기반 폴백'})`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

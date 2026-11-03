import { useState, type FormEvent } from 'react';
import { sendEvent } from '../data/dataSource';
import { askGuide } from '../features/guide/guideClient';
import { useCampusStore } from '../store/useCampusStore';
import type { GuideResponse } from '../types/generated/campus';

/** AI 길안내 입력창 (채팅 UI는 M3에서 확장) */
export function GuideBox() {
  const index = useCampusStore((s) => s.index);
  const navigate = useCampusStore((s) => s.navigate);
  const select = useCampusStore((s) => s.select);
  const clearRoute = useCampusStore((s) => s.clearRoute);

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; source: GuideResponse['source'] } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || !index || busy) return;
    setBusy(true);
    const { result, source } = await askGuide(q, index.buildings);
    let text = result.message;
    let success = true;
    let target: string | null = null;

    switch (result.action) {
      case 'navigate':
        target = result.to_id;
        if (!navigate(result.from_id, result.to_id)) {
          text = '경로를 찾지 못했어요. 출발지와 도착지를 다시 알려주세요.';
          success = false;
        }
        break;
      case 'focus_building':
        target = result.building_id;
        clearRoute();
        select(result.building_id);
        break;
      case 'start_tour':
        text = '캠퍼스 투어는 곧 공개됩니다! (M4)';
        break;
      case 'unknown':
        success = false;
        break;
    }

    sendEvent({ type: 'guide', query: q, target_id: target, success });
    setReply({ text, source });
    setBusy(false);
  }

  return (
    <div className="absolute bottom-8 left-1/2 w-[min(640px,calc(100%-32px))] -translate-x-1/2">
      {reply && (
        <div className="mb-3 rounded-2xl border border-white/10 bg-[#0d1528]/85 px-4 py-3 text-sm text-slate-100 shadow-xl backdrop-blur">
          <span className="mr-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
            {reply.source === 'llm' ? 'AI' : '기본 안내'}
          </span>
          {reply.text}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-[#0d1528]/90 p-2 shadow-[0_0_40px_rgba(79,209,255,0.18)] backdrop-blur-md"
      >
        <span className="pl-3 text-lg">🧭</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
          placeholder="예: 학생회관에서 이공관 가는 길 알려줘"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
        />
        <button
          disabled={busy || !query.trim()}
          className="rounded-xl bg-accent px-4 py-2 font-semibold text-[#06101f] transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? '찾는 중…' : '길 묻기'}
        </button>
      </form>
    </div>
  );
}

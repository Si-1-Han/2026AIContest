import { create } from 'zustand';
import type { BirdCaption } from '../features/tour/birdTour';

/** 매 프레임 바뀌는 재생 시각. React 상태가 아니라 여기서 읽고 쓴다. */
export const birdClock = { t: 0 };

interface BirdTourState {
  /** 화면 표시용 시각(0.1초 단위로 갱신) */
  time: number;
  duration: number;
  playing: boolean;
  caption: BirdCaption | null;
  /** 녹화·발표용으로 화면 UI를 모두 숨긴다 */
  uiHidden: boolean;
  reset: (duration: number) => void;
  toggle: () => void;
  pause: () => void;
  play: () => void;
  seek: (t: number) => void;
  setUiHidden: (hidden: boolean) => void;
  report: (time: number, caption: BirdCaption | null) => void;
}

export const useBirdTourStore = create<BirdTourState>((set, get) => ({
  time: 0, duration: 0, playing: true, caption: null, uiHidden: false,
  reset: (duration) => { birdClock.t = 0; set({ time: 0, duration, playing: true, caption: null }); },
  toggle: () => {
    const s = get();
    // 끝까지 본 뒤 재생하면 처음부터
    if (!s.playing && birdClock.t >= s.duration) birdClock.t = 0;
    set({ playing: !s.playing });
  },
  pause: () => set({ playing: false }),
  play: () => { if (birdClock.t >= get().duration) birdClock.t = 0; set({ playing: true }); },
  seek: (t) => { birdClock.t = Math.max(0, Math.min(get().duration, t)); set({ time: birdClock.t }); },
  setUiHidden: (uiHidden) => set({ uiHidden }),
  report: (time, caption) => {
    const s = get(), rounded = Math.round(time * 10) / 10;
    const same = s.caption?.id === caption?.id && s.caption?.kind === caption?.kind;
    if (rounded !== s.time || !same) set({ time: rounded, ...(same ? {} : { caption }) });
  },
}));

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminData } from './AdminData';

export function AdminAccess({ open, onClose, user, setUser }: {
  open: boolean; onClose: () => void; user: string | null; setUser: (user: string | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [dashboard, setDashboard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function enterDashboard(name: string) {
    sessionStorage.setItem('campus-admin-screen', 'open');
    setUser(name);
    setDashboard(true);
  }

  function leaveDashboard() {
    sessionStorage.removeItem('campus-admin-screen');
    setDashboard(false);
  }

  useEffect(() => {
    const restoreDashboard = sessionStorage.getItem('campus-admin-screen') === 'open';
    let active = true;
    void fetch('/api/v1/admin/me', { credentials: 'same-origin' }).then(async (response) => {
      if (!active) return;
      if (!response.ok) { setUser(null); sessionStorage.removeItem('campus-admin-screen'); return; }
      const account = await response.json();
      if (active) {
        if (restoreDashboard) enterDashboard(account.username);
        else setUser(account.username);
      }
    }).catch(() => { sessionStorage.removeItem('campus-admin-screen'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    setError('');
    setPassword('');
    let cancelled = false;
    void fetch('/api/v1/admin/me', { credentials: 'same-origin' }).then(async (response) => {
      const account = response.ok ? await response.json() : null;
      if (cancelled) return;
      if (account) { enterDashboard(account.username); onClose(); }
      else { setUser(null); dialog.current?.showModal(); }
    }).catch(() => { if (!cancelled) dialog.current?.showModal(); });
    return () => { cancelled = true; };
  }, [open, onClose]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v1/admin/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const account = await response.json();
      if (!response.ok) throw new Error(typeof account.detail === 'string' ? account.detail : '로그인 정보를 확인해 주세요.');
      enterDashboard(account.username);
      setPassword('');
      onClose();
    } catch (failure) {
      setError(failure instanceof Error && !/fetch|JSON|Unexpected/i.test(failure.message)
        ? failure.message : '서버에 연결할 수 없습니다. Python API 실행 상태를 확인해 주세요.');
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v1/admin/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      setUser(null); leaveDashboard(); onClose();
    } catch { setError('로그아웃하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  const button = 'rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
  return <>
    <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="admin-login-title" className="fixed inset-0 m-auto w-[min(380px,calc(100%-32px))] rounded-2xl border border-white/15 bg-[#0d1528] p-6 text-white shadow-2xl backdrop:bg-black/65">
      <div className="mb-6 flex items-center justify-between"><h2 id="admin-login-title" className="text-xl font-bold">관리자 로그인</h2><button type="button" onClick={onClose} aria-label="닫기" className={button}>✕</button></div>
      <form onSubmit={(event) => void login(event)} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">아이디<input autoFocus required maxLength={100} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 outline-accent" /></label>
        <label className="flex flex-col gap-2 text-sm">비밀번호<input required maxLength={200} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 outline-accent" /></label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="rounded-xl bg-accent py-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? '확인 중…' : '로그인'}</button>
      </form>
    </dialog>
    {dashboard && user && <section aria-label="관리자 화면" className="absolute inset-0 z-[100] overflow-y-auto bg-[#0b1222] p-6 text-white sm:p-10" onKeyDown={(event) => event.stopPropagation()}>
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-xs tracking-widest text-accent">HANSEI UNIVERSITY</p><h1 className="mt-2 text-2xl font-bold">캠퍼스 관리자</h1><p className="mt-2 text-sm text-slate-400">{user}님으로 로그인했습니다.</p></div><div className="flex gap-2"><button className={button} onClick={leaveDashboard}>캠퍼스로 돌아가기</button><button disabled={busy} className={button} onClick={() => void logout()}>로그아웃</button></div></header>
        {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
        <AdminData />
      </div>
    </section>}
  </>;
}

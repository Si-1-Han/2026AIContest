import { notifyDataUpdated, type DataKind } from '../data/dataUpdates';

export async function adminApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/admin/${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new Error('서버에 연결할 수 없습니다. Python API 실행 상태를 확인해 주세요.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail
    : response.status === 422 ? '입력값을 확인해 주세요. 시간은 30분 단위이며 종료는 시작보다 늦어야 합니다.'
    : response.status === 401 ? '로그인이 만료되었습니다. 캠퍼스로 돌아가 다시 로그인해 주세요.'
    : '데이터를 처리하지 못했습니다. 서버 연결을 확인해 주세요.');
  if (method !== 'GET') notifyDataUpdated(path.split('/')[0] as DataKind);
  return data;
}

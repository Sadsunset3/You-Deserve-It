import type { GameConfig, RoomView } from '@ydi/contracts';

async function request<T>(url: string, options?: RequestInit): Promise<T> { const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...options?.headers }, credentials: 'include' }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? '请求失败'); return data as T; }
export const api = {
  session: () => request<{ playerId: string }>('/api/session'),
  testDeepSeekKey: (apiKey: string) => request<{ ok: true }>('/api/ai/test-key', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  freeToken: (code: string) => request<{ ok: true }>('/api/ai/free-token', { method: 'POST', body: JSON.stringify({ code }) }),
  create: (nickname: string, config: GameConfig, credential: { apiKey?: string; freeToken?: boolean }) => request<{ roomCode: string }>('/api/rooms', { method: 'POST', body: JSON.stringify({ nickname, config, ...credential }) }),
  join: (nickname: string, roomCode: string) => request<{ roomCode: string }>('/api/rooms/join', { method: 'POST', body: JSON.stringify({ nickname, roomCode }) }),
  room: (code: string) => request<RoomView>(`/api/rooms/${code}`),
  action: (code: string, action: string, body: object = {}) => request<{ ok: true }>(`/api/rooms/${code}/${action}`, { method: 'POST', body: JSON.stringify(body) }),
};

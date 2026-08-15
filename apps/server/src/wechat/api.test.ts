import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeWechatApi } from './api';

afterEach(() => vi.unstubAllGlobals());

const tokenResponse = () => new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('WeChat official-account API client', () => {
  it('fetches and caches the access token', async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/cgi-bin/token')) return tokenResponse();
      throw new Error('unexpected ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = makeWechatApi('wx-test', 'secret-test');
    expect(await api.getAccessToken()).toBe('token-1');
    expect(await api.getAccessToken()).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a template message with the openid, template id and data', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes('/cgi-bin/token')) return tokenResponse();
      if (url.includes('/message/template/send')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ touser: 'openid-1', template_id: 'tmpl-1', data: { keyword1: { value: '888888' } } });
        return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('unexpected ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = makeWechatApi('wx-test', 'secret-test');
    await api.sendTemplate('openid-1', 'tmpl-1', undefined, { keyword1: { value: '888888' } });
  });

  it('creates a custom menu with the configured buttons', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes('/cgi-bin/token')) return tokenResponse();
      if (url.includes('/menu/create')) {
        expect(JSON.parse(String(init?.body))).toEqual({ button: [{ type: 'click', name: '获取验证码', key: 'LOGIN' }] });
        return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('unexpected ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = makeWechatApi('wx-test', 'secret-test');
    await api.createMenu([{ type: 'click', name: '获取验证码', key: 'LOGIN' }]);
  });

  it('throws when WeChat returns a business error', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ errcode: 40001, errmsg: 'invalid credential' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const api = makeWechatApi('wx-test', 'secret-test');
    await expect(api.getAccessToken()).rejects.toThrow(/40001/);
  });
});

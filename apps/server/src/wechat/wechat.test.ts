import { describe, expect, it } from 'vitest';
import { decryptWechatMessage, encryptWechatMessage, validateSignature, wechatMsgSignature } from './wechat';

const AES_KEY = '1o1U9cHtJs0s838MKDgqN8vQcbN6CIce4ThdGWOfaWn';
const APP_ID = 'wx-test-app';

describe('WeChat crypto', () => {
  it('rejects signatures that do not match the sorted token hash', () => {
    expect(validateSignature('bad', '1', '2', 'token')).toBe(false);
  });

  it('round-trips a message through encrypt and decrypt', () => {
    const xml = '<xml><ToUserName><![CDATA[gh_x]]></ToUserName><FromUserName><![CDATA[openid-1]]></FromUserName><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[验证码]]></Content></xml>';
    const encrypted = encryptWechatMessage(xml, AES_KEY, APP_ID);
    expect(encrypted).not.toContain('验证码');
    expect(decryptWechatMessage(encrypted, AES_KEY, APP_ID)).toBe(xml);
  });

  it('rejects decrypted messages carrying the wrong appid', () => {
    const encrypted = encryptWechatMessage('<xml/>', AES_KEY, APP_ID);
    expect(() => decryptWechatMessage(encrypted, AES_KEY, 'wx-other-app')).toThrow();
  });

  it('decrypts without an appid when none is configured', () => {
    const xml = '<xml><Content><![CDATA[验证码]]></Content></xml>';
    const encrypted = encryptWechatMessage(xml, AES_KEY, 'any-app');
    expect(decryptWechatMessage(encrypted, AES_KEY, '')).toBe(xml);
  });

  it('binds the msg signature to the ciphertext', () => {
    const a = wechatMsgSignature('token', '1', '2', 'cipher-a');
    const b = wechatMsgSignature('token', '1', '2', 'cipher-b');
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toBe(b);
  });
});

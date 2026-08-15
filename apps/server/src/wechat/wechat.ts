import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const LOGIN_KEYWORDS = new Set(['验证码', '登录', '登陆', 'Login', 'login', 'LOGIN']);

/** WeChat server signature check: sha1 of sorted (token, timestamp, nonce). */
export function validateSignature(signature: string, timestamp: string, nonce: string, token: string): boolean {
  const str = [token, timestamp, nonce].sort().join('');
  const digest = createHash('sha1').update(str).digest('hex');
  return digest === signature;
}

/** Message signature for encrypted traffic: sha1 of sorted (token, timestamp, nonce, encrypt). */
export function wechatMsgSignature(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const str = [token, timestamp, nonce, encrypt].sort().join('');
  return createHash('sha1').update(str).digest('hex');
}

export function xmlField(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return (match?.[1] ?? '').trim();
}

export type WechatMessage = {
  fromUserName: string;
  toUserName: string;
  msgType: string;
  content: string;
  event?: string;
  eventKey?: string;
};

export function parseWechatMessage(xml: string): WechatMessage | null {
  const fromUserName = xmlField(xml, 'FromUserName');
  const toUserName = xmlField(xml, 'ToUserName');
  const msgType = xmlField(xml, 'MsgType');
  if (!fromUserName || !toUserName || !msgType) return null;
  const event = xmlField(xml, 'Event');
  const eventKey = xmlField(xml, 'EventKey');
  return {
    fromUserName,
    toUserName,
    msgType,
    content: xmlField(xml, 'Content'),
    ...(event ? { event } : {}),
    ...(eventKey ? { eventKey } : {}),
  };
}

export function isLoginKeyword(content: string) {
  return LOGIN_KEYWORDS.has(content.trim());
}

export function sendTextMessage(toUser: string, fromUser: string, content: string): string {
  return [
    '<xml>',
    `<ToUserName><![CDATA[${toUser}]]></ToUserName>`,
    `<FromUserName><![CDATA[${fromUser}]]></FromUserName>`,
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>`,
    '<MsgType><![CDATA[text]]></MsgType>',
    `<Content><![CDATA[${content}]]></Content>`,
    '</xml>',
  ].join('');
}

function aesKey(encodingAesKey: string): Buffer {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) throw new Error('Invalid EncodingAESKey');
  return key;
}

function pkcs7Pad(data: Buffer): Buffer {
  const pad = 32 - (data.length % 32);
  return Buffer.concat([data, Buffer.alloc(pad, pad)]);
}

function pkcs7Unpad(data: Buffer): Buffer {
  const pad = data[data.length - 1];
  if (!pad || pad < 1 || pad > 32) throw new Error('Invalid PKCS7 padding');
  return data.subarray(0, data.length - pad);
}

/** Decrypts a WeChat <Encrypt> payload back to the inner message XML. */
export function decryptWechatMessage(encrypt: string, encodingAesKey: string, appId: string): string {
  const key = aesKey(encodingAesKey);
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypt, 'base64')), decipher.final()]);
  const plain = pkcs7Unpad(decrypted);
  const msgLength = plain.readUInt32BE(16);
  const message = plain.subarray(20, 20 + msgLength).toString('utf8');
  if (appId && plain.subarray(20 + msgLength).toString('utf8') !== appId) throw new Error('Invalid appid in decrypted message');
  return message;
}

/** Encrypts an outbound message XML into a WeChat <Encrypt> payload. */
export function encryptWechatMessage(message: string, encodingAesKey: string, appId: string): string {
  const key = aesKey(encodingAesKey);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(Buffer.byteLength(message), 0);
  const payload = Buffer.concat([randomBytes(16), length, Buffer.from(message, 'utf8'), Buffer.from(appId, 'utf8')]);
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(pkcs7Pad(payload)), cipher.final()]).toString('base64');
}

export function encryptedReplyXml(encrypt: string, signature: string, timestamp: string, nonce: string): string {
  return [
    '<xml>',
    `<Encrypt><![CDATA[${encrypt}]]></Encrypt>`,
    `<MsgSignature><![CDATA[${signature}]]></MsgSignature>`,
    `<TimeStamp>${timestamp}</TimeStamp>`,
    `<Nonce><![CDATA[${nonce}]]></Nonce>`,
    '</xml>',
  ].join('');
}

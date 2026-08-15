import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiKeySchema, appendDebateMessageSchema, createRoomSchema, joinRoomSchema, lockDebateTargetSchema } from '@ydi/contracts';
import { validateCatalog, catalog } from './content/catalog.js';
import { createAiGateway, testAiConnection, type AiGateway } from './ai/client.js';
import { RoomAiKeyStore } from './ai/room-key-store.js';
import { VerificationCodeStore } from './ai/verification-code-store.js';
import { FreeTokenGrantStore } from './ai/free-token-grant-store.js';
import { decryptWechatMessage, encryptedReplyXml, encryptWechatMessage, isLoginKeyword, parseWechatMessage, sendTextMessage, validateSignature, wechatMsgSignature, xmlField } from './wechat/wechat.js';
import { makeWechatApi } from './wechat/api.js';
import { GameStore } from './persistence/store.js';
import { RoomManager, type RoomTickEvent } from './rooms/manager.js';
import { Server as SocketServer } from 'socket.io';
import { selectCharactersSchema, attachTraitSchema, commandSchema } from '@ydi/contracts';

const AGNES_DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const AGNES_DEFAULT_MODEL = 'agnes-2.0-flash';
const AGNES_DEFAULT_API_KEY = 'sk-e4NeJjpoVR8foSKxLMIQspKj56tDHdjYn8JXpWx6z0CxjYvP';
const FREE_TOKEN_TTL_MS = Number(process.env.FREE_TOKEN_TTL_MINUTES || 60) * 60 * 1000;

type AppOptions = {
  databasePath: string;
  sessionSecret: string;
  webOrigin?: string;
  webRoot?: string;
  aiKeys?: RoomAiKeyStore;
  aiGatewayFactory?: (apiKey: string) => AiGateway;
  agnesGatewayFactory?: () => AiGateway;
  testDeepSeekKey?: (apiKey: string) => Promise<{ ok: true }>;
  wechatToken?: string;
  wechatEncodingAesKey?: string;
  wechatAppId?: string;
  wechatAppSecret?: string;
  wechatTemplateId?: string;
  wechatMenuKey?: string;
  verificationCodes?: VerificationCodeStore;
  freeTokenGrants?: FreeTokenGrantStore;
};
export async function buildApp(options: AppOptions) {
  validateCatalog(catalog);
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof Error ? error : new Error('服务器无法处理请求');
    if (known.name === 'ZodError') {
      const issue = (known as Error & { issues?: Array<{ path?: PropertyKey[] }> }).issues?.[0];
      const field = issue?.path?.at(-1);
      const messages: Partial<Record<PropertyKey, string>> = {
        debateMinutes: '聊天室时长必须是 3 到 10 分钟的整数',
      };
      return reply.code(400).send({ error: field === undefined ? '提交的参数不符合要求' : messages[field] ?? '提交的参数不符合要求' });
    }
    const status = known.message.includes('not found') ? 404 : 409;
    return reply.code(status).send({ error: known.message });
  });
  await app.register(cookie, { secret: options.sessionSecret, hook: 'onRequest' });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addContentTypeParser(['text/xml', 'application/xml'], { parseAs: 'string' }, (_request, body, done) => { done(null, body); });
  const store = new GameStore(options.databasePath);
  const aiKeys = options.aiKeys ?? new RoomAiKeyStore();
  const aiGatewayFactory = options.aiGatewayFactory ?? ((apiKey: string) => createAiGateway({ apiKey }));
  const agnesGatewayFactory = options.agnesGatewayFactory ?? (() => createAiGateway({ apiKey: process.env.AGNES_API_KEY || AGNES_DEFAULT_API_KEY, baseURL: process.env.AGNES_BASE_URL || AGNES_DEFAULT_BASE_URL, model: process.env.AGNES_MODEL || AGNES_DEFAULT_MODEL, thinking: false }));
  const testDeepSeekKey = options.testDeepSeekKey ?? testAiConnection;
  const verificationCodes = options.verificationCodes ?? new VerificationCodeStore();
  const freeTokenGrants = options.freeTokenGrants ?? new FreeTokenGrantStore();
  const wechatToken = options.wechatToken ?? process.env.WECHAT_TOKEN ?? '';
  const wechatEncodingAesKey = options.wechatEncodingAesKey ?? process.env.WECHAT_ENCODING_AES_KEY ?? '';
  const wechatAppId = options.wechatAppId ?? process.env.WECHAT_APP_ID ?? '';
  const wechatAppSecret = options.wechatAppSecret ?? process.env.WECHAT_APP_SECRET ?? '';
  const wechatTemplateId = options.wechatTemplateId ?? process.env.WECHAT_TEMPLATE_ID ?? '';
  const wechatMenuKey = options.wechatMenuKey ?? process.env.WECHAT_MENU_KEY ?? 'LOGIN';
  const wechatApi = wechatAppId && wechatAppSecret ? makeWechatApi(wechatAppId, wechatAppSecret) : null;
  const pushVerificationCode = async (openid: string, code: string) => {
    if (!wechatApi || !wechatTemplateId) return false;
    await wechatApi.sendTemplate(openid, wechatTemplateId, undefined, {
      first: { value: '您正在使用「活该」AI 道德辩论游戏' },
      keyword1: { value: code },
      keyword2: { value: '5 分钟内有效' },
      remark: { value: '祝你玩的愉快' },
    });
    return true;
  };
  const rooms = new RoomManager(store);
  app.decorate('rooms', rooms);
  app.addHook('onClose', async () => store.close());
  const playerId = (request: { cookies: Record<string, string | undefined> }, reply: { setCookie(name: string, value: string, options: object): unknown }) => { const signed = request.cookies.ydi_session ? app.unsignCookie(request.cookies.ydi_session) : null; if (signed?.valid && signed.value) return signed.value; const id = randomUUID(); reply.setCookie('ydi_session', id, { path: '/', httpOnly: true, sameSite: 'lax', signed: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 }); return id; };
  const aiForRoom = (code: string) => { const credential = aiKeys.get(code); if (!credential) throw new Error('房间 DeepSeek Key 已失效，请重新建房'); return credential.provider === 'agnes' ? agnesGatewayFactory() : aiGatewayFactory(credential.apiKey); };
  const releaseKeyIfFinished = (code: string) => { if (rooms.get(code).phase === 'match-end') aiKeys.delete(code); };
  app.get('/api/health', async () => ({ ok: true, catalog: true }));
  app.post('/api/ai/test-key', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const apiKey = apiKeySchema.parse((request.body as { apiKey?: unknown } | null)?.apiKey);
    try { return await testDeepSeekKey(apiKey); } catch { return reply.code(409).send({ error: 'DeepSeek Key 无法连接，请检查 Key、账户余额或网络' }); }
  });
  app.post('/api/rooms', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = createRoomSchema.parse(request.body);
    const player = playerId(request, reply);
    if (body.freeToken) {
      if (!freeTokenGrants.has(player)) return reply.code(403).send({ error: '免费 Token 已失效，请重新获取验证码' });
      const room = await rooms.create(player, body.nickname, body.config);
      aiKeys.set(room.roomCode, { provider: 'agnes' });
      return reply.code(201).send({ roomCode: room.roomCode });
    }
    const room = await rooms.create(player, body.nickname, body.config);
    aiKeys.set(room.roomCode, { provider: 'user', apiKey: body.apiKey ?? '' });
    return reply.code(201).send({ roomCode: room.roomCode });
  });
  app.get('/api/wechat/event', async (request, reply) => {
    const query = request.query as { signature?: string; timestamp?: string; nonce?: string; echostr?: string };
    if (typeof query.signature === 'string' && typeof query.timestamp === 'string' && typeof query.nonce === 'string' && typeof query.echostr === 'string') {
      if (validateSignature(query.signature, query.timestamp, query.nonce, wechatToken)) {
        return reply.type('text/plain').send(query.echostr);
      }
      if (wechatEncodingAesKey && wechatMsgSignature(wechatToken, query.timestamp, query.nonce, query.echostr) === query.signature) {
        try { return reply.type('text/plain').send(decryptWechatMessage(query.echostr, wechatEncodingAesKey, wechatAppId)); } catch { /* fall through to reject */ }
      }
    }
    return reply.code(401).send('Invalid signature');
  });
  app.post('/api/wechat/event', async (request, reply) => {
    const query = request.query as { signature?: string; msg_signature?: string; timestamp?: string; nonce?: string };
    if (typeof query.timestamp !== 'string' || typeof query.nonce !== 'string') return reply.code(401).send('Invalid signature');
    const rawXml = typeof request.body === 'string' ? request.body : '';
    const encrypt = xmlField(rawXml, 'Encrypt');

    let message: ReturnType<typeof parseWechatMessage>;
    if (encrypt) {
      const msgSignature = query.msg_signature ?? query.signature ?? '';
      if (!wechatEncodingAesKey || wechatMsgSignature(wechatToken, query.timestamp, query.nonce, encrypt) !== msgSignature) return reply.code(401).send('Invalid signature');
      try { message = parseWechatMessage(decryptWechatMessage(encrypt, wechatEncodingAesKey, wechatAppId)); } catch { return reply.code(401).send('Invalid signature'); }
    } else {
      if (typeof query.signature !== 'string' || !validateSignature(query.signature, query.timestamp, query.nonce, wechatToken)) return reply.code(401).send('Invalid signature');
      message = parseWechatMessage(rawXml);
    }

    if (!message) return reply.send('success');
    const wantsCode =
      (message.msgType === 'text' && isLoginKeyword(message.content)) ||
      (message.msgType === 'event' && message.event === 'subscribe') ||
      (message.msgType === 'event' && message.event === 'CLICK' && message.eventKey === wechatMenuKey);
    if (!wantsCode) return reply.send('success');

    const code = verificationCodes.create(message.fromUserName);
    if (wechatApi && wechatTemplateId) {
      void pushVerificationCode(message.fromUserName, code).catch((error) => app.log.error({ error }, 'failed to push verification code via template'));
      return reply.send('success');
    }
    const replyMessage = sendTextMessage(message.fromUserName, message.toUserName, `在线网站验证码为：${code}，验证码 5 分钟内有效，祝你玩的愉快。`);
    if (encrypt && wechatEncodingAesKey) {
      const encryptedReply = encryptWechatMessage(replyMessage, wechatEncodingAesKey, wechatAppId);
      return reply.type('application/xml').send(encryptedReplyXml(encryptedReply, wechatMsgSignature(wechatToken, query.timestamp, query.nonce, encryptedReply), query.timestamp, query.nonce));
    }
    return reply.type('application/xml').send(replyMessage);
  });
  app.post('/api/ai/free-token', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const code = (request.body as { code?: unknown } | null)?.code;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return reply.code(400).send({ error: '请输入 6 位验证码' });
    if (!verificationCodes.consume(code)) return reply.code(400).send({ error: '验证码无效或已过期' });
    freeTokenGrants.grant(playerId(request, reply), FREE_TOKEN_TTL_MS);
    return { ok: true };
  });
  app.post('/api/rooms/join', async (request, reply) => { const body = joinRoomSchema.parse(request.body); const room = await rooms.join(body.roomCode, playerId(request, reply), body.nickname); return { roomCode: room.roomCode }; });
  app.get('/api/session', async (request, reply) => ({ playerId: playerId(request, reply), nonce: randomBytes(8).toString('hex') }));
  const identity = (request: { cookies: Record<string, string | undefined> }) => { const signed = request.cookies.ydi_session ? app.unsignCookie(request.cookies.ydi_session) : null; if (!signed?.valid || !signed.value) throw new Error('player session required'); return signed.value; };
  const once = async (code: string, commandId: string, action: () => Promise<unknown>) => { if (store.hasCommand(code, commandId)) return false; await action(); store.saveCommand(code, commandId); return true; };
  const broadcast = (code: string) => { const room = rooms.get(code); for (const player of room.players) io.to(`${code}:${player.playerId}`).emit('room:state', rooms.view(code, player.playerId)); };
  app.get('/api/rooms/:code', async (request) => rooms.view((request.params as { code: string }).code, identity(request)));
  app.post('/api/rooms/:code/ready', async (request) => { const code = (request.params as { code: string }).code; await rooms.ready(code, identity(request)); broadcast(code); return { ok: true }; });
  app.post('/api/rooms/:code/start', async (request) => { const code = (request.params as { code: string }).code; await rooms.start(code, identity(request)); broadcast(code); return { ok: true }; });
  app.post('/api/rooms/:code/select', async (request) => { const code = (request.params as { code: string }).code; const body = selectCharactersSchema.parse(request.body); await once(code, body.commandId, () => rooms.select(code, identity(request), body.expectedVersion, body.characterIds)); broadcast(code); return { ok: true }; });
  app.post('/api/rooms/:code/trait', async (request) => { const code = (request.params as { code: string }).code; const body = attachTraitSchema.parse(request.body); await once(code, body.commandId, () => rooms.addTrait(code, identity(request), body.expectedVersion, body.traitId, body.targetId)); broadcast(code); return { ok: true }; });
  app.post('/api/rooms/:code/traits-done', async (request) => { const code = (request.params as { code: string }).code; const body = commandSchema.parse(request.body); await once(code, body.commandId, () => rooms.finishTraits(code, identity(request), body.expectedVersion)); broadcast(code); return { ok: true }; });
  app.post('/api/rooms/:code/surrender', async (request) => { const code = (request.params as { code: string }).code; const body = commandSchema.parse(request.body); await once(code, body.commandId, () => rooms.surrender(code, identity(request), body.expectedVersion)); broadcast(code); releaseKeyIfFinished(code); return { ok: true }; });
  app.post('/api/rooms/:code/debate-target', async (request) => {
    const code = (request.params as { code: string }).code;
    const body = lockDebateTargetSchema.parse(request.body);
    await once(code, body.commandId, () => rooms.lockDebateTarget(code, identity(request), body.expectedVersion, body.targetId));
    broadcast(code);
    return { ok: true };
  });
  app.post('/api/rooms/:code/debate-messages', async (request) => {
    const code = (request.params as { code: string }).code;
    const body = appendDebateMessageSchema.parse(request.body);
    const message = await rooms.appendDebateMessage(code, identity(request), body.messageId, body.text);
    broadcast(code);
    return { message };
  });
  app.post('/api/rooms/:code/ready-next-game', async (request) => { const code = (request.params as { code: string }).code; const body = commandSchema.parse(request.body); await once(code, body.commandId, () => rooms.readyNextGame(code, identity(request), body.expectedVersion)); broadcast(code); releaseKeyIfFinished(code); return { ok: true }; });
  app.post('/api/rooms/:code/round-result-done', async (request) => {
    const code = (request.params as { code: string }).code;
    const body = commandSchema.parse(request.body);
    let event: RoomTickEvent | null = null;
    await once(code, body.commandId, async () => {
      event = await rooms.confirmRoundResult(code, identity(request), body.expectedVersion);
    });
    broadcast(code);
    if (event) {
      try { await processTickEvent(event); } catch (error) { app.log.error({ error }, 'round-result confirm failed to resolve the track'); }
      broadcast(code);
    }
    return { ok: true };
  });
  const io = new SocketServer(app.server, { path: '/socket.io', cors: { origin: options.webOrigin ?? true, credentials: true } });
  io.on('connection', (socket) => { let subscribed: { roomCode: string; playerId: string } | null = null; socket.on('room:subscribe', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => { try { rooms.view(roomCode, playerId); subscribed = { roomCode, playerId }; rooms.setConnected(roomCode, playerId, true); socket.join(`${roomCode}:${playerId}`); broadcast(roomCode); } catch { socket.emit('room:error', { error: '无法订阅该房间' }); } }); socket.on('disconnect', () => { if (!subscribed) return; const stillConnected = Array.from(io.sockets.sockets.values()).some((candidate) => candidate.id !== socket.id && candidate.rooms.has(`${subscribed!.roomCode}:${subscribed!.playerId}`)); if (!stillConnected) { try { rooms.setConnected(subscribed.roomCode, subscribed.playerId, false); broadcast(subscribed.roomCode); releaseKeyIfFinished(subscribed.roomCode); } catch (error) { app.log.debug({ error }, 'ignored disconnect after room disposal'); } } }); });
  app.addHook('onClose', async () => io.close());
  const processTickEvent = async (event: RoomTickEvent) => {
    const ai = aiForRoom(event.roomCode);
    if (event.type === 'round-adjudication') {
      const verdict = await ai.decideRound(event.input);
      await rooms.resolveRound(event.roomCode, event.version, verdict);
      broadcast(event.roomCode);
      return;
    }
    const trackVerdict = await ai.decideTrack(event.input);
    await rooms.resolveTrack(event.roomCode, event.version, trackVerdict);
    broadcast(event.roomCode);
    const judgmentVersion = rooms.get(event.roomCode).version;
    const judgment = await ai.judgeMatch(rooms.getJudgmentInput(event.roomCode));
    await rooms.saveJudgment(event.roomCode, judgmentVersion, judgment);
    broadcast(event.roomCode);
  };
  const runScheduler = async () => {
    store.cleanup();
    for (const event of await rooms.tick()) await processTickEvent(event);
    for (const code of aiKeys.codes()) releaseKeyIfFinished(code);
    for (const code of new Set(Array.from(io.sockets.sockets.values()).flatMap((socket) => Array.from(socket.rooms).map((room) => room.split(':')[0]!)))) { try { broadcast(code); } catch (error) { app.log.debug({ error }, 'ignored broadcast after room disposal'); } }
  };
  const scheduler = setInterval(() => { void runScheduler().catch((error) => app.log.error({ error }, 'room scheduler failed')); }, 1000);
  scheduler.unref();
  app.addHook('onClose', async () => clearInterval(scheduler));
  const webRoot = options.webRoot ?? resolve(process.cwd(), '../../apps/web/dist');
  if (existsSync(webRoot)) { await app.register(staticPlugin, { root: webRoot, wildcard: false }); app.get('/*', async (_request, reply) => reply.sendFile('index.html')); }
  return app;
}

declare module 'fastify' { interface FastifyInstance { rooms: RoomManager } }

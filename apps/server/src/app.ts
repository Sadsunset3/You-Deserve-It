import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiKeySchema, createRoomSchema, joinRoomSchema } from '@ydi/contracts';
import { validateCatalog, catalog } from './content/catalog.js';
import { createAiGateway, testAiConnection, type AiGateway } from './ai/client.js';
import { RoomAiKeyStore } from './ai/room-key-store.js';
import { GameStore } from './persistence/store.js';
import { RoomManager } from './rooms/manager.js';
import { Server as SocketServer } from 'socket.io';
import { selectCharactersSchema, attachTraitSchema, submitSpeechSchema, commandSchema, targetSchema } from '@ydi/contracts';

type AppOptions = {
  databasePath: string;
  sessionSecret: string;
  webOrigin?: string;
  webRoot?: string;
  aiKeys?: RoomAiKeyStore;
  aiGatewayFactory?: (apiKey: string) => AiGateway;
  testDeepSeekKey?: (apiKey: string) => Promise<{ ok: true }>;
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
        selectionSeconds: '选牌秒数必须在 20 到 120 秒之间',
        traitSeconds: '词条秒数必须在 20 到 180 秒之间',
        speechSeconds: '辩论秒数必须在 30 到 180 秒之间',
        disconnectSeconds: '掉线判负秒数必须在 60 到 300 秒之间',
      };
      return reply.code(400).send({ error: field === undefined ? '提交的参数不符合要求' : messages[field] ?? '提交的参数不符合要求' });
    }
    const status = known.message.includes('not found') ? 404 : 409;
    return reply.code(status).send({ error: known.message });
  });
  await app.register(cookie, { secret: options.sessionSecret, hook: 'onRequest' });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const store = new GameStore(options.databasePath);
  const aiKeys = options.aiKeys ?? new RoomAiKeyStore();
  const aiGatewayFactory = options.aiGatewayFactory ?? ((apiKey: string) => createAiGateway({ apiKey }));
  const testDeepSeekKey = options.testDeepSeekKey ?? testAiConnection;
  const rooms = new RoomManager(store);
  app.decorate('rooms', rooms);
  app.addHook('onClose', async () => store.close());
  const playerId = (request: { cookies: Record<string, string | undefined> }, reply: { setCookie(name: string, value: string, options: object): unknown }) => { const signed = request.cookies.ydi_session ? app.unsignCookie(request.cookies.ydi_session) : null; if (signed?.valid && signed.value) return signed.value; const id = randomUUID(); reply.setCookie('ydi_session', id, { path: '/', httpOnly: true, sameSite: 'lax', signed: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 }); return id; };
  const aiForRoom = (code: string) => { const apiKey = aiKeys.get(code); if (!apiKey) throw new Error('房间 DeepSeek Key 已失效，请重新建房'); return aiGatewayFactory(apiKey); };
  const releaseKeyIfFinished = (code: string) => { if (rooms.get(code).phase === 'match-end') aiKeys.delete(code); };
  app.get('/api/health', async () => ({ ok: true, catalog: true }));
  app.post('/api/ai/test-key', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const apiKey = apiKeySchema.parse((request.body as { apiKey?: unknown } | null)?.apiKey);
    try { return await testDeepSeekKey(apiKey); } catch { return reply.code(409).send({ error: 'DeepSeek Key 无法连接，请检查 Key、账户余额或网络' }); }
  });
  app.post('/api/rooms', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => { const body = createRoomSchema.parse(request.body); const room = await rooms.create(playerId(request, reply), body.nickname, body.config); aiKeys.set(room.roomCode, body.apiKey); return reply.code(201).send({ roomCode: room.roomCode }); });
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
  app.post('/api/rooms/:code/attack', async (request) => { const code = (request.params as { code: string }).code; const speech = submitSpeechSchema.merge(targetSchema).parse(request.body); await once(code, speech.commandId, () => rooms.submitAttack(code, identity(request), speech.expectedVersion, speech.targetId, speech.text)); broadcast(code); return { ok: true }; });
  app.post('/api/rooms/:code/defend', async (request) => {
    const code = (request.params as { code: string }).code;
    const speech = submitSpeechSchema.parse(request.body);
    const performed = await once(code, speech.commandId, () => rooms.submitDefense(code, identity(request), speech.expectedVersion, speech.text));
    broadcast(code);
    if (!performed) return { ok: true };
    const version = rooms.get(code).version;
    const verdict = await aiForRoom(code).decideRound(rooms.getRoundDecisionInput(code));
    await rooms.resolveRound(code, version, verdict);
    broadcast(code);
    return { ok: true };
  });
  app.post('/api/rooms/:code/advance-round', async (request) => {
    const code = (request.params as { code: string }).code;
    const body = commandSchema.parse(request.body);
    const performed = await once(code, body.commandId, () => rooms.advanceAfterRound(code, body.expectedVersion));
    broadcast(code);
    if (!performed || rooms.get(code).phase !== 'track-adjudicating') return { ok: true };
    let version = rooms.get(code).version;
    const ai = aiForRoom(code);
    const trackVerdict = await ai.decideTrack(rooms.getTrackDecisionInput(code));
    await rooms.resolveTrack(code, version, trackVerdict);
    broadcast(code);
    version = rooms.get(code).version;
    const judgment = await ai.judgeMatch(rooms.getJudgmentInput(code));
    await rooms.saveJudgment(code, version, judgment);
    broadcast(code);
    return { ok: true };
  });
  app.post('/api/rooms/:code/ready-next-game', async (request) => { const code = (request.params as { code: string }).code; const body = commandSchema.parse(request.body); await once(code, body.commandId, () => rooms.readyNextGame(code, identity(request), body.expectedVersion)); broadcast(code); releaseKeyIfFinished(code); return { ok: true }; });
  const io = new SocketServer(app.server, { path: '/socket.io', cors: { origin: options.webOrigin ?? true, credentials: true } });
  io.on('connection', (socket) => { let subscribed: { roomCode: string; playerId: string } | null = null; socket.on('room:subscribe', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => { try { rooms.view(roomCode, playerId); subscribed = { roomCode, playerId }; rooms.setConnected(roomCode, playerId, true); socket.join(`${roomCode}:${playerId}`); broadcast(roomCode); } catch { socket.emit('room:error', { error: '无法订阅该房间' }); } }); socket.on('disconnect', () => { if (!subscribed) return; const stillConnected = Array.from(io.sockets.sockets.values()).some((candidate) => candidate.id !== socket.id && candidate.rooms.has(`${subscribed!.roomCode}:${subscribed!.playerId}`)); if (!stillConnected) { try { rooms.setConnected(subscribed.roomCode, subscribed.playerId, false); broadcast(subscribed.roomCode); } catch (error) { app.log.debug({ error }, 'ignored disconnect after room disposal'); } } }); });
  app.addHook('onClose', async () => io.close());
  const scheduler = setInterval(() => { store.cleanup(); rooms.advanceExpired().then(() => { for (const code of aiKeys.codes()) releaseKeyIfFinished(code); for (const code of new Set(Array.from(io.sockets.sockets.values()).flatMap((socket) => Array.from(socket.rooms).map((room) => room.split(':')[0]!)))) { try { broadcast(code); } catch (error) { app.log.debug({ error }, 'ignored broadcast after room disposal'); } } }).catch((error) => app.log.error({ error }, 'room scheduler failed')); }, 1000);
  scheduler.unref();
  app.addHook('onClose', async () => clearInterval(scheduler));
  const webRoot = options.webRoot ?? resolve(process.cwd(), '../../apps/web/dist');
  if (existsSync(webRoot)) { await app.register(staticPlugin, { root: webRoot, wildcard: false }); app.get('/*', async (_request, reply) => reply.sendFile('index.html')); }
  return app;
}

declare module 'fastify' { interface FastifyInstance { rooms: RoomManager } }

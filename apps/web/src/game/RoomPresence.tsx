import type { RoomView } from '@ydi/contracts';

export function RoomPresence({ room }: { room: RoomView }) {
  const opponent = room.opponent;
  return <div className="room-presence" aria-label="房间在线状态">
    <span className={room.me.connected ? 'is-online' : 'is-offline'}><i aria-hidden="true" />{room.me.nickname} · {room.me.connected ? '在线' : '已掉线'}</span>
    {opponent
      ? <span className={opponent.connected ? 'is-online' : 'is-offline'}><i aria-hidden="true" />{opponent.nickname} · {opponent.connected ? '在线' : '已掉线'}</span>
      : <span className="is-empty"><i aria-hidden="true" />等待对手</span>}
  </div>;
}

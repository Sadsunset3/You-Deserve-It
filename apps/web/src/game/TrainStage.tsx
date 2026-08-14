import type { ReactNode } from 'react';
import type { RoomView } from '@ydi/contracts';

export function TrainStage({ room, children, dragLayer }: { room: RoomView; children: ReactNode; dragLayer?: ReactNode }) {
  if (!room.conductor) throw new Error('选择阶段缺少列车长');

  return (
    <section className="train-stage" aria-label="火车审判现场">
      <aside className="conductor-profile" aria-label="当前列车长">
        <div className="conductor-face" aria-hidden="true">ಠ_ಠ</div>
        <div className="conductor-copy"><span>本局列车长</span><h2>{room.conductor.name}</h2><p>{room.conductor.persona}</p><strong>{room.conductor.rule}</strong></div>
      </aside>
      <div className="stage-train" role="img" aria-label="列车" data-testid="train"><i aria-hidden="true">☁︎</i><b>审判<br/>列车</b><span aria-hidden="true">● ● ●</span></div>
      {children}
      {dragLayer}
    </section>
  );
}

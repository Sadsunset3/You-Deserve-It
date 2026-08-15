import { useState } from 'react';
import { api } from './api';

export function FreeTokenModal({ onClose, onVerified }: { onClose(): void; onVerified(): void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [verified, setVerified] = useState(false);

  const changeCode = (value: string) => {
    setCode(value.replace(/\D/g, '').slice(0, 6));
    setError('');
  };

  const verify = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.freeToken(code);
      setVerified(true);
      onVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '验证失败，请检查验证码');
    } finally {
      setBusy(false);
    }
  };

  return <div className="free-token-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="free-token-modal" role="dialog" aria-modal="true" aria-label="免费 Token 验证">
      <button type="button" className="free-token-close" aria-label="关闭" onClick={onClose}>×</button>
      <h2>免费 Token</h2>
      {verified
        ? <div className="free-token-success" role="status">
            <p>验证成功，免费 Token 已就绪。</p>
            <button type="button" className="primary" onClick={onClose}>关闭并建房</button>
          </div>
        : <>
          <ol className="free-token-steps">
            <li>微信扫码关注公众号（或搜索关注：sadsunset技术分享）</li>
            <li>向公众号回复【验证码】</li>
            <li>输入公众号回复的 6 位验证码</li>
          </ol>
          <div className="free-token-qr">
            {qrFailed
              ? <span className="free-token-qr-placeholder">公众号二维码<br/>请将图片放到 apps/web/public/wx-qrcode.jpg</span>
              : <img src="/wx-qrcode.jpg" width={200} height={200} alt="公众号二维码" onError={() => setQrFailed(true)} />}
          </div>
          <label className="free-token-code">
            6 位验证码
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => changeCode(event.target.value)}
              placeholder="000000"
              aria-label="验证码"
            />
          </label>
          <p className="free-token-hint">验证码 5 分钟内有效，一个验证码只能使用一次。</p>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="button" className="primary free-token-submit" disabled={busy || code.length !== 6} onClick={() => void verify()}>
            {busy ? '正在验证…' : '验证并领取免费 Token'}
          </button>
        </>}
    </div>
  </div>;
}

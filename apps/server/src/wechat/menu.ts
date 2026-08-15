import { makeWechatApi } from './api.js';

const appId = process.env.WECHAT_APP_ID ?? '';
const appSecret = process.env.WECHAT_APP_SECRET ?? '';
if (!appId || !appSecret) {
  console.error('缺少 WECHAT_APP_ID / WECHAT_APP_SECRET，无法创建自定义菜单');
  process.exit(1);
}

const menuKey = process.env.WECHAT_MENU_KEY ?? 'LOGIN';
const webUrl = process.env.WEB_ORIGIN ?? 'https://game.sadsunset.cloud';

const api = makeWechatApi(appId, appSecret);
const result = await api.createMenu([
  { type: 'click', name: '获取验证码', key: menuKey },
  { type: 'view', name: '进入游戏', url: webUrl },
]);
console.log(`菜单创建成功（获取验证码 / 进入游戏 ${webUrl}）：`, JSON.stringify(result));

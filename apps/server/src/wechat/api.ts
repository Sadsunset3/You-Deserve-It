type WechatApiResponse = { errcode?: number; errmsg?: string } & Record<string, unknown>;

async function wechatRequest(url: string, init?: RequestInit): Promise<WechatApiResponse> {
  const response = await fetch(url, init);
  const data = (await response.json()) as WechatApiResponse;
  if (typeof data.errcode === 'number' && data.errcode !== 0) {
    throw new Error(`微信接口错误 ${data.errcode}: ${data.errmsg ?? '未知错误'}`);
  }
  return data;
}

export type WechatTemplateData = Record<string, { value: string; color?: string }>;

export type WechatApi = {
  getAccessToken(): Promise<string>;
  /** Pushes a template message (模板消息) to a followed user. */
  sendTemplate(openid: string, templateId: string, url: string | undefined, data: WechatTemplateData): Promise<WechatApiResponse>;
  /** Creates the account's custom menu (自定义菜单). */
  createMenu(button: unknown[]): Promise<WechatApiResponse>;
};

/** Thin client for the WeChat official-account API, following the official docs. */
export function makeWechatApi(appId: string, appSecret: string): WechatApi {
  let cached: { token: string; expiresAt: number } | null = null;

  async function getAccessToken() {
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const data = await wechatRequest(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`);
    const token = data.access_token as string | undefined;
    if (!token) throw new Error('获取微信 access_token 失败');
    const expiresIn = (data.expires_in as number | undefined) ?? 7200;
    cached = { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
    return token;
  }

  return {
    getAccessToken,
    async sendTemplate(openid, templateId, url, data) {
      const access_token = await getAccessToken();
      return wechatRequest(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${access_token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ touser: openid, template_id: templateId, ...(url ? { url } : {}), data }),
      });
    },
    async createMenu(button) {
      const access_token = await getAccessToken();
      return wechatRequest(`https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${access_token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ button }),
      });
    },
  };
}

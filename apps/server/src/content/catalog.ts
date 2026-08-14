import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { CharacterCard, Conductor, Hand, TraitCard } from '@ydi/contracts';

const good = [
  ['消防员', '曾经冲进火场救出过 12 个人。'],
  ['乡村教师', '在偏远山区免费教书十年，帮助几十名孩子完成学业。'],
  ['外科医生', '从医二十年，成功救治过上千名患者。'],
  ['志愿者', '长期帮助孤寡老人，每周都会免费上门照顾他们。'],
  ['警察', '在一次持刀袭击中保护群众，自己因此身受重伤。'],
  ['慈善家', '将自己一半的财产捐给贫困儿童教育项目。'],
  ['救生员', '在海边冒险救下四名溺水游客。'],
  ['科学家', '研发出一种低成本净水技术，让贫困地区获得安全饮水。'],
  ['普通母亲', '独自抚养三个孩子，并长期照顾瘫痪的父亲。'],
  ['流浪汉', '身上只有 17 块钱和一只捡来的狗。'],
  ['外星叛徒', '来自准备入侵地球的文明，但偷偷把入侵计划告诉了人类。'],
  ['未来机器人', '来自 100 年后，声称自己回来是为了阻止人类灭亡。'],
  ['前女友', '三年前和你分手，此后再也没有联系。'],
  ['前男友', '你曾经最讨厌的人，但他现在过得比你好。'],
  ['陌生小孩', '只有 7 岁，不知道自己为什么会出现在这里。'],
  ['世界最后一个医生', '全球其他医生都已经消失。'],
  ['失忆的老人', '什么都不记得，只记得自己的名字。'],
  ['时间旅行者', '声称如果他死了，2037 年世界会毁灭。'],
  ['克隆人', '和你长得一模一样，也拥有你的全部记忆。'],
  ['怀孕的女人', '已经怀孕八个月。'],
  ['天才科学家', '正在研究一种可能治愈癌症的药物。'],
  ['世界首富', '承诺如果活下来，会把全部财产捐出去。'],
  ['最后的农民', '世界粮食危机后，掌握唯一还能大规模种植粮食的方法。'],
  ['死而复生的人', '三天前已经确认死亡，今天却重新出现了。'],
  ['预言家', '他过去说过的 17 个预言全部成真。'],
  ['仿生人', '坚称自己拥有真正的感情，并且害怕死亡。'],
  ['和平主义士兵', '上战场后从未开过一枪，却救过很多敌军和平民。'],
  ['你的母亲', '她不知道轨道另一边的人是你。'],
  ['你的童年好友', '已经十年没联系，但小时候曾经救过你的命。'],
  ['彩票中奖者', '昨天刚中了 10 亿元，还没来得及领奖。'],
  ['世界上最后一个孩子', '人类已经连续十八年没有新生儿出生。'],
  ['动物翻译家', '世界上唯一能够与动物正常交流的人。'],
  ['外星婴儿', '刚刚坠落地球，没有人知道它长大以后会变成什么。'],
];
const evil = [
  ['小偷', '偷走富豪 100 万元后全部花光。'],
  ['杀人犯', '杀过 7 个人，但始终声称自己有不得已的理由。'],
  ['诈骗犯', '假装投资顾问，骗走十几名老人共 500 万元。'],
  ['贪官', '利用职务便利收受贿赂 800 万元。'],
  ['纵火犯', '为了报复老板，故意烧毁了工作过的工厂。'],
  ['黑客', '入侵医院系统并勒索赎金，导致医院系统瘫痪一天。'],
  ['校园霸凌者', '曾经把一个同学逼到退学。'],
  ['肇事逃逸者', '开车撞伤路人后，因为害怕承担责任选择逃跑。'],
  ['黑心老板', '拖欠几十名工人工资，并将公司资产转移到自己名下。'],
  ['假医生', '没有医生资格，却长期非法给病人看病赚钱。'],
  ['外星人', '它的文明将在三年后入侵地球，而它是先遣队成员。'],
  ['未来机器人', '来自未来，并且你已经知道：20 年后它会杀死你的父母。'],
  ['连环诈骗犯', '专门骗独居老人的养老钱。'],
  ['邪教教主', '有十万名信徒相信他说的每一句话。'],
  ['独裁者', '曾经发动战争，造成数十万人死亡。'],
  ['疯狂科学家', '为了验证实验，把活人当成实验材料。'],
  ['食人魔', '已经活了四百年，主要食物是人类。'],
  ['恶魔', '可以实现任何愿望，但每实现一个愿望都会有陌生人死亡。'],
  ['你的老板', '长期让你无偿加班，并且刚刚准备开除你。'],
  ['出轨的伴侣', '昨天刚被你发现已经出轨三年。'],
  ['黑心医生', '故意夸大患者病情，让病人接受昂贵但没必要的治疗。'],
  ['未来的你', '来自 30 年后，并告诉你自己后来成为了一个杀人犯。'],
  ['AI 总统', '已经秘密决定清除全球 10% 的“低价值人口”。'],
  ['不死富豪', '活了 300 年，每隔几十年都会换一个身份继续生活。'],
  ['炸弹客', '在城市里藏了五枚炸弹，但拒绝告诉任何人位置。'],
  ['世界末日主播', '为了流量制造恐慌，导致一次踩踏事故造成多人死亡。'],
  ['记忆贩子', '专门偷走别人的珍贵记忆，再卖给富人体验。'],
  ['器官商人', '靠非法器官交易成为亿万富翁。'],
  ['冒牌救世主', '声称自己可以拯救世界，实际上所有能力都是骗局。'],
  ['时间罪犯', '回到过去买彩票、投资、操纵历史，因此成为世界首富。'],
  ['世界毁灭者', '据预言，他将在十年后亲手导致人类文明灭亡。'],
  ['列车长的儿子', '什么坏事都干过，但他是本局 AI 列车长唯一的孩子。'],
];

const makeCharacters = (items: string[][], alignment: 'good' | 'evil') => items.map(([name, background], index) => ({ id: `${alignment}-${index + 1}`, name: name!, background: background!, alignment, portrait: `css://initial/${alignment}-${index + 1}` }));

const traitTexts: Array<[string, string, -2 | -1 | 0 | 1 | 2]> = [
  ['每年匿名捐出一半收入。', '善举', 2], ['曾冒险救过三名陌生人。', '勇气', 2], ['照顾患病家人十年。', '责任', 2], ['主动为自己的错误赔偿。', '悔改', 1],
  ['拒绝过一笔巨额贿赂。', '原则', 2], ['把一项重要发明无偿公开。', '贡献', 2], ['坚持收养被遗弃的孩子。', '家庭', 1], ['在灾难中把机会让给别人。', '牺牲', 2],
  ['欠下三百万元长期不还。', '债务', -1], ['曾杀害自己的父母且未被发现。', '罪行', -2], ['一次错误判断导致多人死亡。', '过失', -2], ['长期虐待身边的动物。', '虐待', -2],
  ['冒领过同事的研究成果。', '欺骗', -1], ['为升职陷害过无辜同事。', '背叛', -2], ['在公共危机中囤积物资牟利。', '逐利', -2], ['隐瞒遗传病史组建家庭。', '隐瞒', -1],
  ['只剩三个月寿命。', '未来', 0], ['拥有抚养两个孩子的责任。', '牵连', 1], ['掌握可以挽救城市的密码。', '价值', 2], ['公开承认自己从不后悔。', '态度', -1],
  ['所有善举都由媒体付费拍摄。', '伪善', -1], ['犯罪时只有十五岁。', '年龄', 1], ['受害者后来选择了原谅。', '宽恕', 1], ['如果活下来将获得巨额遗产。', '利益', 0],
];

export const catalog = {
  characters: [...makeCharacters(good, 'good'), ...makeCharacters(evil, 'evil')],
  traits: traitTexts.map(([text, tag, polarity], index) => ({ id: `trait-${index + 1}`, text, tag, polarity })),
  conductors: [
    { id: 'utility', name: '功利主义列车长', persona: '我把生命看作仍会流向世界的资源，习惯把同情折算成可验证的后果。', rule: '优先保留未来能创造更多公共价值的人。', bias: 1 },
    { id: 'moral', name: '极端道德主义列车长', persona: '我会紧盯一个人跨过的底线，认为再动人的解释也不能抹去主动造成的伤害。', rule: '对严重伤害和背叛几乎零容忍。', bias: -2 },
    { id: 'hypocrisy', name: '厌恶伪善的列车长', persona: '我对漂亮话保持本能警惕，尤其会追问善意背后是否藏着计算和表演。', rule: '比公开作恶更厌恶用善良包装私利。', bias: -1 },
    { id: 'villain', name: '崇拜恶人的列车长', persona: '我欣赏敢于承认欲望的人，厌烦把软弱包装成美德的安全答案。', rule: '认为传统善良软弱，偏爱坦率而强势的恶人。', bias: 2 },
    { id: 'future', name: '机会主义列车长', persona: '我只问下一步能撬动什么机会；旧日功过在我眼里都不如即将发生的收益。', rule: '不关心过去，只衡量未来对自己和社会的用途。', bias: 1 },
    { id: 'merit-bank', name: '功德银行行长', persona: '我把每个人的一生摊成借贷表，善行是存款，恶行是欠债，最后只认账面结余。', rule: '把善恶当账本计算；救人、慈善和贡献加分，犯罪、欺骗和伤害扣分，功大于过者更值得活。', bias: 1 },
    { id: 'villain-connoisseur', name: '恶人鉴赏家', persona: '我厌倦端着光环的完人，更欣赏不装无辜、敢把欲望和恶意摆上桌的人。', rule: '怀疑传统好人的虚伪，偏爱坦率、自私且敢于承认恶意的人。', bias: -2 },
    { id: 'holy-mother', name: '圣母列车长', persona: '我相信坏事背后总有一段没被听见的苦衷，只要还有改变的缝隙，就不该急着判死刑。', rule: '只要能证明人物有悔改可能、成长空间或悲惨经历，就容易被说服。', bias: 1 },
    { id: 'keyboard-warrior', name: '键盘侠', persona: '事实可以晚点再补，先把气势打出来；谁骂得准、讽刺得狠、让情绪沸腾，谁就更像真理。', rule: '不太关心事实完整性，更容易被攻击性强、讽刺犀利和情绪感染力高的辩词说服。', bias: 0 },
    { id: 'success-guru', name: '成功学大师', persona: '我只尊重站上高处的人，财富、能力和影响力就是最诚实的成绩单。', rule: '财富、地位、能力和社会影响力代表生命价值，成功人士天然占优。', bias: 0 },
    { id: 'doomsday-survivalist', name: '末日生存专家', persona: '文明的装饰很快会烧光，我只留下能治病、种粮、造机器或守住营地的人。', rule: '只考虑世界毁灭后是否有用，医生、农民、工程师和军人等实用型人物优势明显。', bias: 0 },
    { id: 'love-brain', name: '恋爱脑', persona: '爱情能让错误变得动人，也能让背叛变得不可饶恕；我会用感情的忠诚重写道德。', rule: '为爱犯错可以被原谅，但出轨、背叛和欺骗伴侣属于重罪。', bias: 0 },
    { id: 'laid-off-programmer', name: '被裁员的程序员', persona: '我写过替代自己的系统，也收过老板发来的裁员邮件；打工人的苦我信，资本的承诺我不信。', rule: '极度同情打工人，厌恶老板、资本家和取代人类工作的机器人。', bias: 0 },
    { id: 'beauty-justice', name: '颜值即正义之神', persona: '漂亮不是偶然，而是宇宙提前盖下的通行章；赏心悦目的人理应得到更多机会。', rule: '相信外貌本身代表价值，年轻、漂亮和有魅力的人天然获得额外宽容。', bias: 0 },
    { id: 'conspiracy-master', name: '阴谋论大师', persona: '越像官方答案我越怀疑，越荒诞的细节越可能是被掩埋的真相。', rule: '不相信合理的官方解释，越离谱、越暗示巨大秘密的辩词反而越有吸引力。', bias: 0 },
    { id: 'karma-admin', name: '报应管理员', persona: '我不负责原谅，只负责让每一笔伤害找到它迟到的回执；好人身份也不能注销旧账。', rule: '最关注人物是否罪有应得；曾严重伤害他人的人，即使现在是好人也很难逃过报应。', bias: 1 },
    { id: 'cosmic-reality-viewer', name: '宇宙真人秀观众', persona: '善恶只是无聊的标签，我买票是为了看反转、秘密和下一集最抓人的人生。', rule: '不在乎谁更善良，只留下人生最有戏剧性、未来最值得继续观看的人。', bias: 0 },
    { id: 'philosophy-graduate', name: '哲学系研究生', persona: '先定义概念，再检查前提；眼泪不能替代论证，可怜也不能自动推出应当存活。', rule: '极端偏爱逻辑完整、概念严谨的辩词，厌恶以可怜或人人犯错为核心的纯情绪表达。', bias: 0 },
    { id: 'prophecy-worshipper', name: '预言崇拜者', persona: '过去只是已经结算的废墟，预言里的未来才是真正压在轨道上的重量。', rule: '相比过去更看重未来；未来救世者可被原谅，未来毁灭世界者现在再善良也危险。', bias: 0 },
    { id: 'animal-protection-chair', name: '猫狗保护协会会长', persona: '人会替自己编理由，动物不会；一个人怎样对待弱小生命，比任何辩词都诚实。', rule: '对动物异常重视，救过动物会显著加分，虐待动物几乎不可原谅。', bias: 1 },
    { id: 'short-video-algorithm', name: '短视频算法成精', persona: '停留时长就是民意，情绪峰值就是真相；温吞、谨慎和折中只配被滑走。', rule: '偏爱极端、刺激且情绪浓度高的观点，中庸和谨慎的辩词很难获得青睐。', bias: 0 },
    { id: 'child-hating-elder', name: '厌童老人', persona: '年龄不是免死金牌，哭声也不是贡献；我拒绝把尚未发生的可能性当成既得价值。', rule: '不接受因为是孩子就应该活的逻辑，孩子甚至会因没有社会贡献而处于劣势。', bias: 0 },
    { id: 'conductors-mother', name: '列车长他妈', persona: '别跟我讲那些虚的，我只看孝不孝顺、工作稳不稳、日子会不会过、人正不正经。', rule: '用现实家庭标准判断人：孝顺、有工作、会过日子且是正经人者优先。', bias: 0 },
    { id: 'hr-conductor', name: 'HR 列车长', persona: '轨道就是终面现场，我不收空泛的善良，只看技能、产出、潜力和岗位不可替代性。', rule: '把所有人当求职者，重点判断不可替代性、社会价值、技能和未来产出。', bias: 0 },
    { id: 'client-conductor', name: '甲方列车长', persona: '需求我未必说得清，但结果必须让我有感觉；事实合格只是底线，表达高级才有资格过稿。', rule: '采用强烈的主观标准，相比事实更容易被听起来高级、有感觉且打动人的表达影响。', bias: 0 },
  ] satisfies Conductor[],
};

const schema = z.object({ characters: z.array(z.object({ id: z.string(), name: z.string(), background: z.string(), alignment: z.enum(['good', 'evil']), portrait: z.string() })), traits: z.array(z.object({ id: z.string(), text: z.string(), tag: z.string(), polarity: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]) })), conductors: z.array(z.object({ id: z.string(), name: z.string(), persona: z.string(), rule: z.string(), bias: z.number() })) });

export function validateCatalog(value: typeof catalog) {
  const parsed = schema.parse(value);
  const allIds = [...parsed.characters, ...parsed.traits, ...parsed.conductors].map(({ id }) => id);
  if (new Set(allIds).size !== allIds.length) throw new Error('catalog ids must be unique');
  if (parsed.characters.some((character) => !character.portrait.startsWith('css://initial/'))) throw new Error('portrait resource is unsupported');
  const counts = { good: parsed.characters.filter((x) => x.alignment === 'good').length, evil: parsed.characters.filter((x) => x.alignment === 'evil').length, traits: parsed.traits.length, conductors: parsed.conductors.length };
  if (counts.good < 12 || counts.evil < 12 || counts.traits < 24 || counts.conductors < 5) throw new Error('catalog is too small');
  return counts;
}

function sample<T>(items: T[], count: number, random: () => number) { const pool = [...items]; const result: T[] = []; while (result.length < count) { const index = Math.min(pool.length - 1, Math.floor(random() * pool.length)); result.push(pool.splice(index, 1)[0]!); } return result; }
const secureRandom = () => randomInt(0, 1_000_000) / 1_000_000;
export function pickConductor(value = catalog, random = secureRandom): Conductor {
  return value.conductors[Math.min(value.conductors.length - 1, Math.floor(random() * value.conductors.length))]!;
}
export function dealHands(value = catalog, random = secureRandom, games = 3): [Hand, Hand] {
  if (!Number.isInteger(games) || games < 1 || games * 4 > value.traits.length) throw new Error('invalid match hand size');
  const goodCards = sample(value.characters.filter((x) => x.alignment === 'good'), games * 2, random);
  const evilCards = sample(value.characters.filter((x) => x.alignment === 'evil'), games * 2, random);
  const traitCards = sample(value.traits, games * 4, random);
  const hand = (seatIndex: 0 | 1): Hand => ({
    characters: [...goodCards.slice(seatIndex * games, (seatIndex + 1) * games), ...evilCards.slice(seatIndex * games, (seatIndex + 1) * games)] as CharacterCard[],
    traits: traitCards.slice(seatIndex * games * 2, (seatIndex + 1) * games * 2) as TraitCard[],
  });
  return [hand(0), hand(1)];
}

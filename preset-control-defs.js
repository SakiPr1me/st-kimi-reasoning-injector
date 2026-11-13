/* ==========================================================================
   余小温主控 · 预设控件定义（纯数据，不碰 DOM / 不碰真实设置）
   - 稳定 ID 全部取自 contracts/control-contract.json（V1028 默认预设）。
   - 这里只写首批要用的条目与短标签；不复制 preview 的 90KB 配置。
   - 任何运行期状态都必须从当前 oai prompt_order（character_id 100001）读取，
     本文件里的 enabled 一律不写死。
   ========================================================================== */

export const PRESET_CONTROLS_VERSION = '1.4.13';
export const CHARACTER_ID = 100001;
export const LENGTH_PROMPT_ID = 'e54f6cda-5eee-421c-921f-1bb405f9e968';
export const LENGTH_PROMPT_NAME = '🔢字数要求';
export const LENGTH_SENTENCE = /- 字数要求:正文的字数控制在(\d+)字以上。/g;

/* 工具箱 flag 控件（不是预设条目）：只允许这两个显式 deps 读写。
   目前只开放 randHeadEnabled；不把它塞进 prompt id / ALL_KNOWN_IDS。 */
export const TOOLBOX_FLAG_RAND_HEAD = 'randHeadEnabled';
export const TOOLBOX_FLAG_KEYS = Object.freeze([TOOLBOX_FLAG_RAND_HEAD]);

export const ID = Object.freeze({
  // 常用
  bilingual: '10aed42b-90cd-48db-baa5-c66bff2446ca',
  localize: 'ad63e236-9b8e-45c5-bf0d-245e5fa0ea49',
  acid: '3f0dd53e-69bf-48c4-bf58-a92064761ce2',
  platonic: '92a6768b-a5de-4600-a7cd-504ab6a47f23',
  paragraphAlt: '19189adb-f366-4f6f-9942-85dbff4cd536',
  paragraphLong: 'mpfpf4tda7vdko964xp',

  // 写作要求（rule 容器剩余内容；静态映射 + 实际 order 过滤）
  wStyleAuto: '27eca046-f52a-4f32-b8e1-7140097c3ffd',
  wStyleAutoOld: '5c104ad1-880c-44bc-9bf3-f8fc2dbb651c',
  wStyleSeam: 'motmbjddu5u3a2egx5b',
  wFresh: 'dca16a62-e3fa-43ef-9372-64126602938f',
  wBitter: '16f4ad31-a1db-4094-9ec7-0bf96e4f161b',
  wCinematic: 'f60f2451-889b-4eac-951b-32d7db8d5f8d',
  wSoft: '005a345e-db93-4e47-a49a-1e00ac37c608',
  wNoCopySet: 'd61c1937-d427-4371-9b76-bbd54485f864',
  wEnsemble: 'mp2dgnuesrymntezrk',
  wParallel: 'cae78ccc-610d-484d-96a0-59599bc48248',
  wShowTell: 'c4b988d8-91c7-43ae-843f-7603f8496f6c',
  wEmotion: '58eda936-e110-4797-b3fa-f138a67ebd91',
  wMouth: '39979b1c-36b2-4091-8c3f-18760aed9d99',
  wDaily: 'c76e04ab-4bb0-4c93-b5bc-5f3c99a6cd87',
  wFavor: 'c751cbfb-c88c-460b-93f9-6e74c2b4c4a8',
  wIntimate: 'ae2e16f2-2705-4dc5-829d-e40c2eb18775',
  wSlow: 'ead4571d-dd55-4a41-9245-9c4de08652bd',
  wNp: '03be0c42-f8c2-4fcb-9631-0b20165e8ff3',
  wFocusUser: 'e978d3cf-6752-42a5-b540-e425b3636ead',
  wJinjiang: '946d9fab-6419-4b75-846f-fdf9e0a55825',
  wOutfit: '57dfe7af-dde1-4f3a-9053-6f7abf769f30',
  wMaleVisual: 'a54f832b-e56c-4344-87bc-b407296b384d',
  wMaterial: '2a9247c6-40f2-4fa0-816a-d50b24c36ccd',
  wFood: '64efd23f-0bf9-41c4-8611-38ba89334b77',
  wAntiHomo: '333c2555-87fb-460a-b82c-60bbc5f49fdb',
  wThunder: '467f46ec-eb30-4110-82a3-0bbe1aec616c',
  wBanList: 'd2d7fa5e-e785-41f7-8a4c-5718f95e313a',
  wElbow: '7a1a6c31-de3c-4777-9de0-0ab22b7515ed',
  wAntiStereo: '809f893c-ad7c-470a-888c-e73538968051',
  wEdge: '16fa5ccf-e0d4-42b3-a8f9-abdeb024e401',
  wXp: '34e16503-74de-4e9d-ba39-771d366a24e1',
  wLightG: 'ac5bd138-b772-49f0-9f64-f26327f73477',

  // NSFW
  nsfwBg: 'e1ffad38-d6ab-4f07-bd56-2e09913d3b3a',
  nsfwBl: 'f069c95c-456d-4527-a2b3-60845037ea69',
  nsfwGl: '94cf07e8-de3c-4cff-ba47-e34f47d2f83c',
  nsfwGb: '68376f20-324a-488f-9afc-a9e40b84c6e0',
  nsfwCarnal: 'b54bd33f-744a-4ce2-a2c2-69b3c15fb5b1',
  nsfwMoanGuide: '788debca-8c35-40f0-be1b-70a8d2ab5548',
  moanHeart: '3f9e67d3-69c0-4eaa-9fc8-c09354c49492',
  nsfwDirtyTalk: '1329e5fa-4863-4560-ad52-22e60c6a6f06',

  // 人称 / 感知
  personThird: 'mqow0p962qxpz4l1q5z',
  personSecond: 'movhvc067cwf044qmqu',
  personFirst: 'movhve7lhj9wg94717',
  dynamic: 'dd858f80-df77-405b-a436-ed9afea8eea9',
  prefC: 'fdf0f3c6-bd5d-461b-a542-c18f964124c5',
  prefU: 'mqon4h347go421oec17',

  // 心理 / 输入
  allowPsych: 'mqq1xn4bmvguwer8hmq',
  cMonologue: '8aff2ddd-cd89-4f35-9729-90bd959bbc42',
  uAllow: '958510da-9096-4c3c-bb01-af72f447666b',
  uForbid: 'mqop7qctd9m0w6c7r9',
  transcriptHalf: 'movhvfie4c0gofaxqle',
  transcriptNone: 'movhvgrgvayggeja4c',
  transcriptFull: 'mp29w4x9dibm0zh07he',
  interruptAll: 'movhvje58xi4hndu938',
  interruptNoUser: 'movhvi6tfeqm6x0l9ib',
  landing: 'b7c24975-d241-474c-8f0c-55d1677781cf',

  // 输出
  critique: 'mp150ie2myxpbnujg2o',
  scene: 'aca1b545-adae-4638-a638-f6f481583e34',
  seven: 'dccc257b-8905-42da-9eb7-40e03f15b90f',
  nsfwSnapshot: '9c36b49e-b1e1-4a52-a6e4-54517fccbf68',
  danmaku: '8962d2a3-c114-4cb2-aac6-63c63860d3d3',
  notes: 'c2693193-8e71-43a1-b546-e9cd25964b63',
  worldEvents: 'fc134310-8d48-4dc3-87f3-c080cad94488',
  summary: 'e2ff38b1-b129-42ae-a74a-8d04193db8e8',
  mutter: '81e0817f-5d09-44c2-a31d-4a0fb946dafe',
  choiceEight: '4950f170-255f-4c15-b73b-6c67f8b7ef5f',
  choiceUser: '29b3a08d-6e33-4adf-b09c-78866e5828b5',
  choiceFive: '8838704d-782e-404b-bf95-4571464dfc02',
  choiceMaster: '27144175-1cd3-4b1e-b75c-4e99387d9602',
  length: 'e54f6cda-5eee-421c-921f-1bb405f9e968',

  // 剧场
  theaterHtml: 'dbca644a-adc3-435f-9e0b-d8d96d40ac34',
  theaterRandom: 'f7acad30-2e25-49b8-a9ad-3bcf82b37787',
  theaterParent: '084e66e8-6eed-42bb-9035-5ce82f74987e',
  theaterChild01: 'd3a2a92a-4b1b-4c01-89c3-9f244669ca31',
  theaterChild02: '04649a8c-ca1c-4f32-8c39-746174394581',
  theaterChild03: '8190ab5c-e9f0-45f2-8b2d-4768a472c9bf',
  theaterChild04: '8d0c2cd9-7597-411c-81a0-372b101108ed',
  theaterChild05: 'f173cfcb-c5aa-4684-9d95-359d32a8e6ab',
  theaterChild06: '7a8c1934-3140-40e8-9979-9cb5dd7cca30',
  theaterChild07: 'f8b808a5-757d-4a50-924b-5307a66beb7a',
  theaterChild08: '3687a21e-fb63-461e-91c2-3906d695348e',
  theaterChild09: '64a6b3e2-5b9a-4fc2-b4f3-c505872781b6',
  theaterChild10: '499dc3c2-d420-48d3-97ec-a9361d8ec105',
  theaterChild11: '541bd289-a3a3-44de-b40c-8806335f98eb',
  theaterChild12: '11355eab-7c33-43d0-903d-0bc3389d0df3',
  theaterChild13: '76df8eea-7d18-433b-8408-61b1636ba45b',
  theaterChild14: '3a461dcb-5b77-4118-8114-8ee738037b8f',
  theaterChild15: 'aae1b67b-0f83-4737-8cad-2f54462e4fcd',
  theaterChild16: '8445d1a2-d35a-4aa6-b19a-e988be99df12',
  theaterChild17: 'f216f81e-a545-40ce-a538-ad1fc2ca41ba',
  theaterChild18: 'c694c6e7-1c92-4079-a2a5-2aef1d83ec1a',
  theaterChild19: '82cb7726-478a-4b6f-8a4f-1fd4fa32326d',
  theaterChild20: 'f2f6f5a3-482e-4e81-97c4-9dca1574027a',
  theaterChild21: 'd7a98fdd-5839-4ed7-8bf2-5a9e54b0021c',
  theaterChild22: '7e8b4539-ce37-4975-80d0-4213d1e1151b',

  // 剧情
  protagonistUser: 'b1e03438-a101-458a-8f94-d46add84f1b3',
  protagonistNot: '5c0648ce-f312-4620-aada-70ffa5fad8ec',
  mainline: 'b06d58db-58ae-4890-9650-580b6c50dd16',
  romance: 'e32526f1-bba4-4659-be3b-5f779ecd48cd',
  antiRush: '78266415-dcf1-46f2-83ad-87a47ae2fc42',
  hook: 'fba2809b-bb52-4e54-a19e-d0823a5b461d',
  paceSlow: 'ms93qz6j6z6omssjz78',
  paceMedium: 'ms7sri5ioeomgl2p54p',
  paceNatural: 'f2853ead-3103-42f3-b895-a1b1cd8c4bb5',
  boostDecel: 'c588c812-8cec-4c54-b773-722407cbf92e',
  boostAccel: 'c586c2e0-3af1-4afa-a896-c313c9fbe1d2',

  // 思考 / 模型
  thinkShort: '956e11af-07de-4789-af43-d230baa4b306',
  thinkLong: '2ffbe992-98b9-4056-b0b5-313fc9a50b62',
  niah: '25801e75-9d5e-4a51-be80-9773220dd8ee',
  break1: '9fc28074-2e0d-4d70-bb52-26f0ffdba5e6',
  break2: '6e986f51-6568-4595-bf92-3a8064aa3cb9',
  chainDs: '85698c23-7a1b-4ef2-b2d4-1dbe5aad9fab',
  chainKimi: 'mscxwkta7e2ycqrq07x',
  chainGmn: 'mqpxwfsgtpqjyb7lthh',
  dsTail1: 'mskolkngax5zzw2v1gs',
  dsTail2: 'mshivz1toreo156c28',
  kimiTail: 'mscydepkyosisewgyc',
  gmnTail1: 'mour003wapke1xacky6',
  gmnTail2: 'c5729e6b-e731-4ebc-aec0-9087e6aa4d11',

  // 元指令
  summon: '40227224-c89a-437b-b3a4-9e604c2d82e0',
  metaSummary: 'mp1l4lfkdqhrw0riuzn',
  metaSummaryTail: 'enhanceDefinitions',
  metaOutline: '557fd911-92b9-4cf9-a079-f8321e565aec',
  metaOutlineTail: '33af946d-f992-4227-8411-e56d61e118ca',
});

const THEATER_CHILD_IDS = [
  ID.theaterChild01, ID.theaterChild02, ID.theaterChild03, ID.theaterChild04,
  ID.theaterChild05, ID.theaterChild06, ID.theaterChild07, ID.theaterChild08,
  ID.theaterChild09, ID.theaterChild10, ID.theaterChild11, ID.theaterChild12,
  ID.theaterChild13, ID.theaterChild14, ID.theaterChild15, ID.theaterChild16,
  ID.theaterChild17, ID.theaterChild18, ID.theaterChild19, ID.theaterChild20,
  ID.theaterChild21, ID.theaterChild22,
];

const D = (id, label, extra) => Object.freeze({ kind: 'toggle', id, label, ...(extra || {}) });

const RADIO = (key, label, options, extra) => Object.freeze({
  kind: 'radio',
  key,
  label,
  options: Object.freeze(options.map(o => Object.freeze({
    value: o[0],
    label: o[1],
    ids: Object.freeze(o[2] || []),
    ...(o[3] ? { sub: o[3] } : {}),
  }))),
  allIds: Object.freeze(options.flatMap(o => o[2] || [])),
  ...(extra || {}),
});

const COMBO = (key, label, options, allIds, extra) => Object.freeze({
  kind: 'combo',
  key,
  label,
  options: Object.freeze(options.map(o => Object.freeze({
    value: o[0],
    label: o[1],
    ids: Object.freeze(o[2] || []),
    ...(o[3] ? { sub: o[3] } : {}),
  }))),
  allIds: Object.freeze(allIds),
  ...(extra || {}),
});

/* 写作要求：rule 容器（35af3840… → 3e07786c…）里未被其它分组覆盖的普通
   条目 + 原先的四项固定写作项；静态顺序按当前 V1028 真实 order（100001），
   运行期 sectionsForOrder 再按真实 order 过滤、排序。闲适/XP/轻G/反刻板已归 NSFW。
   作者 2026-11-13 要求：内置「自适应文风(旧)」不再显示（不删 prompt、兼容保留），
   因此这里不收录；用户自建的 prompt 副本仍可保留。名字逐字取自当前预设。 */
export const WRITING_PROMPTS = Object.freeze([
  [ID.wStyleAuto, '✍自适应文风(灵感TAG·荐✨)'],
  [ID.wStyleSeam, '✍文风缝这'],
  [ID.bilingual, '🗣️双语对白'],
  [ID.localize, '🌍语境本土化'],
  [ID.wCinematic, '🎬电影感'],
  [ID.wSoft, '🌷柔和笔触'],
  [ID.wNoCopySet, '🪄不抄写设定'],
  [ID.wEnsemble, '👥鼓励群像'],
  [ID.wParallel, '↪️平行镜头'],
  [ID.wShowTell, '🔑展示告知'],
  [ID.wEmotion, '💥情绪直球'],
  [ID.wMouth, '🎭嘴上有戏'],
  [ID.wDaily, '🫧日常色气'],
  [ID.wFavor, '💫在意偏爱'],
  [ID.wIntimate, '🧸亲昵暧昧'],
  [ID.wSlow, '🐢情感慢热'],
  [ID.wNp, '💘NP自由'],
  [ID.acid, '🫂酸涩矫正/祛魅char'],
  [ID.wFocusUser, '❤️凝user(或自改)'],
  [ID.wJinjiang, '💢晋江风味包(慎开)'],
  [ID.wOutfit, '👗外貌穿搭'],
  [ID.wMaleVisual, '💪男色视觉'],
  [ID.wMaterial, '🏡物质生活'],
  [ID.wFood, '🍽️食色生香'],
  [ID.wAntiHomo, '🤫防同性恋常态化'],
  [ID.platonic, '🕊️柏拉图(限制插入)'],
  [ID.wThunder, '🌩️小火苗的雷点'],
  [ID.wBanList, '🚫禁令清单'],
  [ID.wElbow, '📝肘击条目填这'],
].map(item => Object.freeze({ id: item[0], label: item[1] })));

/* 从写作要求移入 NSFW 的四项；静态顺序同样按真实 order：
   反刻板 47 → 闲适 48 → XP 49 → 轻G 54（用户枚举顺序不是排序依据）。
   运行期 sectionsForOrder 仍按当前预设真实 order 排，静态顺序只作缺 order 的兜底。 */
export const NSFW_WRITING_PROMPTS = Object.freeze([
  [ID.wAntiStereo, '🔓反刻板原则'],
  [ID.wEdge, '🤏闲适边缘互动'],
  [ID.wXp, '🔥小火苗的XP'],
  [ID.wLightG, '🔞轻G向(可选)'],
].map(item => Object.freeze({ id: item[0], label: item[1] })));

const PARAGRAPH_PROMPTS = Object.freeze([
  [ID.paragraphAlt, '长短段落交替'],
  [ID.paragraphLong, '长段落为主'],
]);

const NARRATION_PROMPTS = Object.freeze([
  [ID.wFresh, '🍃鲜活叙述'],
  [ID.wBitter, '🥀酸涩叙述'],
]);

const WRITING_CONTROLS = Object.freeze([
  /* 段落风格：原两条独立 prompt 合成真实单选组；两条都可关（atMostOne），
     点一个会把另一个改成关，不在渲染时强开、不偷偷改真实值。 */
  RADIO('writing.paragraph', '段落风格', [
    ['alt', '长短段落交替', [ID.paragraphAlt]],
    ['long', '长段落为主', [ID.paragraphLong]],
  ], { atMostOne: true, allowNone: true }),
  /* 叙述风格：鲜活在上、酸涩在下；同样两条都可关。组位置由 sectionsForOrder
     按鲜活条目的真实 order 落在写作序列里，不固定贴段落组。 */
  RADIO('writing.narration', '叙述风格', [
    ['fresh', '🍃鲜活叙述', [ID.wFresh]],
    ['bitter', '🥀酸涩叙述', [ID.wBitter]],
  ], { atMostOne: true, allowNone: true }),
  ...WRITING_PROMPTS.map(item => Object.freeze({
    kind: 'toggle',
    id: item.id,
    label: item.label,
  })),
]);

const SECTION_DEFS = [
  {
    id: 'common',
    label: '常用',
    controls: Object.freeze([
      { kind: 'shortcuts' },
    ]),
  },
  {
    id: 'writing',
    label: '写作要求',
    controls: WRITING_CONTROLS,
  },
  {
    id: 'nsfw',
    label: 'NSFW',
    controls: Object.freeze([
      RADIO('nsfw.orientation', 'NSFW 指南', [
        ['bg', 'BG', [ID.nsfwBg]],
        ['bl', 'BL', [ID.nsfwBl]],
        ['gl', 'GL', [ID.nsfwGl]],
        ['gb', 'GB', [ID.nsfwGb]],
      ], { exactlyOne: true, allowNone: false }),
      D(ID.nsfwCarnal, '多写肉体'),
      D(ID.nsfwMoanGuide, '叫床指导'),
      D(ID.moanHeart, '呻吟爱心'),
      D(ID.nsfwDirtyTalk, '骚话指导'),
      ...NSFW_WRITING_PROMPTS.map(item => Object.freeze({
        kind: 'toggle',
        id: item.id,
        label: item.label,
      })),
    ]),
  },
  {
    id: 'pov',
    label: '视角',
    controls: Object.freeze([
      RADIO('pov.person', '叙事人称', [
        ['third', '第三人称', [ID.personThird]],
        ['second', '第二人称', [ID.personSecond]],
        ['first', '第一人称', [ID.personFirst]],
      ], { exactlyOne: true, allowNone: false }),
      D(ID.dynamic, '动态感知主体'),
      RADIO('pov.preference', '感知偏好', [
        ['c', '偏 C', [ID.prefC]],
        ['u', '偏 U', [ID.prefU]],
        ['none', '不限', []],
      ], { atMostOne: true, allowNone: true }),
    ]),
  },
  {
    id: 'psych_input',
    label: '心理与输入',
    controls: Object.freeze([
      D(ID.allowPsych, '允许心理'),
      D(ID.cMonologue, 'C 内心独白'),
      RADIO('psych.u_monologue', 'U 内心独白', [
        ['allow', '允许', [ID.uAllow]],
        ['forbid', '禁止', [ID.uForbid]],
        ['none', '不开', []],
      ], { atMostOne: true, allowNone: true }),
      RADIO('input.transcript', '转述方式', [
        ['half', '半转述', [ID.transcriptHalf]],
        ['none_direct', '不转述', [ID.transcriptNone]],
        ['full', '全转述', [ID.transcriptFull]],
        ['none', '不开', []],
      ], { atMostOne: true, allowNone: true }),
      RADIO('input.interrupt', '抢话方式', [
        ['all', '抢话', [ID.interruptAll]],
        ['no_user', '不抢话', [ID.interruptNoUser]],
        ['none', '不开', []],
      ], { atMostOne: true, allowNone: true }),
      D(ID.landing, '落点：等待回应'),
    ]),
  },
  {
    id: 'output',
    label: '输出模块',
    controls: Object.freeze([
      D(ID.critique, '毒舌自检'),
      D(ID.scene, '开幕场记'),
      D(ID.seven, '中插吐槽'),
      D(ID.nsfwSnapshot, 'NSFW 状态快照'),
      D(ID.danmaku, '弹幕评论'),
      D(ID.notes, '备忘录', { masterId: ID.choiceMaster }),
      D(ID.worldEvents, '世界支线'),
      D(ID.summary, '剧情摘要'),
      RADIO('output.choice_mode', '选项模式', [
        ['eight', '8 选项', [ID.choiceEight]],
        ['user_response', 'user 回应', [ID.choiceUser]],
        ['five', '5 选项', [ID.choiceFive]],
        ['none', '不开', []],
      ], { atMostOne: true, allowNone: true, masterId: ID.choiceMaster }),
    ]),
  },
  {
    id: 'length',
    label: '字数',
    controls: Object.freeze([
      { kind: 'word', id: ID.length, label: '正文字数' },
    ]),
  },
  {
    id: 'theater',
    label: '小剧场',
    controls: Object.freeze([
      D(ID.theaterHtml, '余温剧场 (HTML)'),
      D(ID.theaterRandom, '随机小剧场'),
      D(ID.theaterParent, '🍿固定剧场'),
      {
        kind: 'multi',
        key: 'theater2.children',
        parentId: ID.theaterParent,
        label: '固定剧场 2 主题（22 项）',
        ids: Object.freeze(THEATER_CHILD_IDS.slice()),
        labels: Object.freeze([
          '结束花絮', '拍摄彩蛋', '删减片段', '导演音轨', '临时换角', '人设互换',
          '恋综模式', '走错片场', '杀青访谈', '角色日记', 'IF 线', '如果本集重来',
          '心声外放', '静止一帧', '无厘头/纯糖', '兽化日常', '萌宝降临', '平行宇宙',
          '神展开日常', '物品会说话', '角色做梦', '相性 100 问',
        ]),
      },
    ]),
  },
  {
    id: 'plot',
    label: '剧情',
    controls: Object.freeze([
      RADIO('plot.protagonist', 'User 位置', [
        ['user_main', 'User 是主角', [ID.protagonistUser]],
        ['not_main', 'User 不是主角', [ID.protagonistNot]],
      ], { exactlyOne: true, allowNone: false }),
      D(ID.mainline, '主线开关'),
      D(ID.romance, '专注感情线'),
      D(ID.antiRush, '防秒车'),
      D(ID.hook, '结尾剧情钩子'),
      RADIO('plot.pace_base', '剧情基本档', [
        ['slow', '慢速 · 极致', [ID.paceSlow]],
        ['medium', '缓速 · 推进', [ID.paceMedium]],
        ['natural', '自然 · 推进', [ID.paceNatural]],
        ['none', '不开', []],
      ], { exactlyOne: true, allowNone: true }),
      RADIO('plot.pace_boost', '加减速叠加', [
        ['decel', '减速剧情', [ID.boostDecel]],
        ['accel', '加速剧情', [ID.boostAccel]],
        ['none', '不开', []],
      ], { atMostOne: true, allowNone: true }),
    ]),
  },
  {
    id: 'think_meta',
    label: '思考与功能',
    controls: Object.freeze([
      RADIO('think.length', '思考长度', [
        ['short', '短思考', [ID.thinkShort]],
        ['long', '长思考', [ID.thinkLong]],
        ['none', '不开（默认）', []],
      ], { exactlyOne: true, allowNone: true }),
      COMBO('think.model', '思维链', [
        ['ds1', 'Deepseek思维链1', [ID.chainDs, ID.dsTail1]],
        ['ds2', 'Deepseek思维链2', [ID.chainDs, ID.dsTail2]],
        ['kimi', 'KIMI思维链', [ID.chainKimi, ID.kimiTail]],
        ['gmn1', 'Gemini 3.1P', [ID.chainGmn, ID.gmnTail1]],
        ['gmn2', 'Gemini 4A/4C/3.8F', [ID.chainGmn, ID.gmnTail2]],
      ], [
        ID.chainDs, ID.chainKimi, ID.chainGmn,
        ID.dsTail1, ID.dsTail2, ID.kimiTail, ID.gmnTail1, ID.gmnTail2,
      ]),
      D(ID.break1, '破限 Part 1'),
      D(ID.break2, '破限 Part 2'),
      D(ID.niah, '插小说防道歉'),
      /* 首页/完整预设页的“随机头部”：只控工具箱 randHeadEnabled，不冒充 preset id。
         _ref/_uid 让 preset-layout 的默认布局/保存布局能按内置控件稳定物化。 */
      {
        kind: 'toolboxFlag',
        flag: TOOLBOX_FLAG_RAND_HEAD,
        key: 'toolbox.' + TOOLBOX_FLAG_RAND_HEAD,
        label: '🎲随机头部',
        _ref: Object.freeze({ type: 'builtin', key: 'toolbox:' + TOOLBOX_FLAG_RAND_HEAD }),
        _uid: 'builtin:toolbox:' + TOOLBOX_FLAG_RAND_HEAD,
      },
      D(ID.mutter, '余小温碎碎念'),
      D(ID.summon, '召唤余小温本体', { action: true }),
      {
        kind: 'comboToggle',
        key: 'meta.summary',
        label: '大总结',
        members: Object.freeze([ID.metaSummary, ID.metaSummaryTail]),
      },
      {
        kind: 'comboToggle',
        key: 'meta.outline',
        label: '生成大纲',
        members: Object.freeze([ID.metaOutline, ID.metaOutlineTail]),
      },
    ]),
  },
];

/* 分组顺序：作者指定「思考与功能」在「剧情」之后收尾。 */
export const SECTION_ICONS = Object.freeze({
  think_meta: '🧠',
  common: '⭐',
  writing: '✍️',
  nsfw: '🔞',
  pov: '🎥',
  psych_input: '💭',
  output: '📦',
  length: '🔢',
  theater: '🎭',
  plot: '🗺️',
});

export const SECTION_ORDER = Object.freeze([
  'common', 'writing', 'nsfw', 'pov', 'psych_input', 'output', 'length', 'theater', 'plot', 'think_meta',
]);

export const SECTIONS = Object.freeze(SECTION_ORDER.map(id => {
  const def = SECTION_DEFS.find(section => section.id === id);
  if (!def) return null;
  return Object.freeze({
    ...def,
    icon: def.icon || SECTION_ICONS[id] || '',
    controls: Object.freeze(def.controls.map(control => Object.freeze({ ...control }))),
  });
}).filter(Boolean));

export const FIXED_SHORTCUT_IDS = Object.freeze([
  ID.bilingual, ID.localize, ID.acid, ID.platonic,
]);

/* 常用默认展示（可移除，不是固定）：默认四项；段落两项已合成 writing.paragraph
   单选组，不再作为两条独立 prompt 放进常用。 */
export const DEFAULT_COMMON_IDS = Object.freeze([
  ...FIXED_SHORTCUT_IDS,
]);

export const PARAGRAPH_RADIO_KEY = 'writing.paragraph';
export const PARAGRAPH_PROMPT_IDS = Object.freeze(PARAGRAPH_PROMPTS.map(item => item[0]));
export const NARRATION_RADIO_KEY = 'writing.narration';
export const NARRATION_PROMPT_IDS = Object.freeze(NARRATION_PROMPTS.map(item => item[0]));

/* 运行期布局：写作/NSFW 段只保留当前预设真实 order 里存在的条目，并按 order 排序。
   写作段段落单选组永远首位；NSFW 按真实 order（闲适→XP→指南→轻G→肉体…）。
   NSFW 的整组控件按组内当前可用条目的最小 order 排，缺组时排在最后。 */
export function sectionsForOrder(orderMap, orderRows) {
  const order = orderMap || Object.create(null);
  const has = id => Object.prototype.hasOwnProperty.call(order, id);
  // order 的值是 enabled；位置单独从宿主顺序表读取，不能按开关值排序。
  const positions = new Map();
  const ids = Array.isArray(orderRows) ? orderRows.map(row => row && row.identifier) : Object.keys(order);
  ids.forEach((id, index) => { if (has(id) && !positions.has(id)) positions.set(id, index); });
  const orderValue = id => positions.has(id) ? positions.get(id) : Number.POSITIVE_INFINITY;
  const controlOrder = control => {
    if (!control) return Number.POSITIVE_INFINITY;
    if (control.kind === 'radio' || control.kind === 'combo') {
      const ids = (control.allIds || []).filter(has);
      if (!ids.length) return Number.POSITIVE_INFINITY;
      return Math.min(...ids.map(orderValue));
    }
    if (control.id && has(control.id)) return orderValue(control.id);
    return Number.POSITIVE_INFINITY;
  };
  return SECTIONS.map(section => {
    if (section.id !== 'writing' && section.id !== 'nsfw') return section;
    const paragraph = section.controls.filter(control => control && control.kind === 'radio' && control.key === PARAGRAPH_RADIO_KEY);
    const toggles = section.controls.filter(control => !(control && control.kind === 'radio' && control.key === PARAGRAPH_RADIO_KEY))
      .filter(control => {
        if (!control) return false;
        if (control.kind === 'radio' || control.kind === 'combo') return true;
        return control.id ? has(control.id) : true;
      })
      .slice()
      .sort((a, b) => controlOrder(a) - controlOrder(b));
    const controls = section.id === 'writing' ? [...paragraph, ...toggles] : toggles;
    return Object.freeze({ ...section, controls: Object.freeze(controls) });
  });
}

export const THEATER_CHILDREN = Object.freeze(THEATER_CHILD_IDS.slice());

/* 快捷选择池：所有单条 toggle / action（组合、单选组不放进快捷）。 */
export const SHORTCUT_POOL = Object.freeze(SECTIONS.flatMap(section => section.controls)
  .filter(control => control && (control.kind === 'toggle' || control.kind === 'action'))
  .map(control => Object.freeze({
    id: control.id,
    label: control.label,
    sub: control.sub || '',
  })));

export const PROMPT_NAMES = Object.freeze({
  [ID.bilingual]: '🗣️双语对白',
  [ID.localize]: '🌍语境本土化',
  [ID.acid]: '🫂酸涩矫正/祛魅char',
  [ID.platonic]: '🕊️柏拉图(限制插入)',
  [ID.paragraphAlt]: '🧶长短段落交替',
  [ID.paragraphLong]: '🧶长段落为主',
  ...Object.fromEntries(WRITING_PROMPTS.map(item => [item.id, item.label])),
  /* 兼容保留：旧文风已不在写作默认列表、反刻板已归 NSFW，但 prompt 自定义副本、
     首页 pin 与旧布局缺项提示仍要用真名识别。 */
  [ID.wStyleAutoOld]: '✍自适应文风(旧)',
  [ID.wAntiStereo]: '🔓反刻板原则',
  ...Object.fromEntries(NARRATION_PROMPTS.map(item => [item[0], item[1]])),
  [ID.nsfwBg]: '🔞NSFW指南(BG版)',
  [ID.nsfwBl]: '🔞NSFW指南(BL版)',
  [ID.nsfwGl]: '🔞NSFW指南(GL版)',
  [ID.nsfwGb]: '🔞NSFW指南(GB版)',
  [ID.nsfwCarnal]: '❤️‍🔥多写肉体',
  [ID.nsfwMoanGuide]: '🫦叫床指导',
  [ID.moanHeart]: '💗呻吟爱心',
  [ID.nsfwDirtyTalk]: '💋骚话指导',
  [ID.personThird]: '👁️‍🗨️第三人称(选1)',
  [ID.personSecond]: '👁️‍🗨️第二人称(选1）',
  [ID.personFirst]: '👁️‍🗨️第一人称(选1）',
  [ID.dynamic]: '🎥动态主体(默认)',
  [ID.prefC]: '🎥C感知主体(可选)',
  [ID.prefU]: '🎥U感知主体(可选)',
  [ID.allowPsych]: '💭允许心理',
  [ID.cMonologue]: '💭C内心独白(选开）',
  [ID.uAllow]: '💭U内心独白(选开）',
  [ID.uForbid]: '🚫U内心独白(选开）',
  [ID.transcriptHalf]: '🗣半转述（扩写并推进）',
  [ID.transcriptNone]: '🗣不转述（直接往后写）',
  [ID.transcriptFull]: '🗣全转述（完全扩写）',
  [ID.interruptAll]: '🗣抢话（扮演所有人）',
  [ID.interruptNoUser]: '🗣不抢话（不扮演user）',
  [ID.landing]: '⏸落点：等待user回应',
  [ID.critique]: '🦂毒舌自检',
  [ID.scene]: '🎬开幕场记',
  [ID.seven]: '😈中插吐槽',
  [ID.nsfwSnapshot]: '🍑NSFW状态快照',
  [ID.danmaku]: '🥰弹幕评论',
  [ID.notes]: '🟡├备忘录开关',
  [ID.worldEvents]: '📢世界支线(推荐!!)',
  [ID.summary]: '📌剧情摘要',
  [ID.mutter]: '📝余小温碎碎念',
  [ID.choiceEight]: '🟢选项开关(8个)',
  [ID.choiceUser]: '🟢选项开关(user回应)',
  [ID.choiceFive]: '🟢┌5选项开关',
  [ID.choiceMaster]: '🔴└总开关',
  [ID.length]: LENGTH_PROMPT_NAME,
  [ID.theaterHtml]: '💗余温剧场(html)',
  [ID.theaterRandom]: '🎁随机小剧场',
  [ID.theaterParent]: '-剧场2(固定)-【需开此头部】',
  [ID.protagonistUser]: '👑User是主角',
  [ID.protagonistNot]: '🧩User不是主角',
  [ID.mainline]: '🗺️主线开关',
  [ID.romance]: '💓专注感情线',
  [ID.antiRush]: '🐢防秒车开关',
  [ID.hook]: '🪝结尾剧情钩子',
  [ID.paceSlow]: '⏩慢速·极致> (K3可开)',
  [ID.paceMedium]: '⏩缓速·推进>>',
  [ID.paceNatural]: '⏩自然·推进>>>',
  [ID.boostDecel]: '⏪减速剧情(不够慢就叠加这个)',
  [ID.boostAccel]: '⏩加速剧情(不够快就叠加这个)',
  [ID.thinkShort]: '🧠短思考(择1自改)',
  [ID.thinkLong]: '🧠长思考(择1自改)',
  [ID.niah]: '🙇‍♂️插小说防道歉',
  [ID.break1]: '🔓破限 Part 1(道歉关)',
  [ID.break2]: '🔓破限 Part 2',
  [ID.chainDs]: '🐋思维链·DS',
  [ID.chainKimi]: '🌙思维链1·KIMI',
  [ID.chainGmn]: '😺思维链·Gmn',
  [ID.dsTail1]: '🐋尾部1·DS(择1)',
  [ID.dsTail2]: '🐋尾部2·DS(择1)',
  [ID.kimiTail]: '🌙尾部·KIMI(必开)',
  [ID.gmnTail1]: '😺尾部1·Gmn3.1(择1)',
  [ID.gmnTail2]: '😺尾部2·Gmn4/3.8(择1)',
  [ID.summon]: '召唤余小温本体',
  [ID.metaSummary]: '📝大总结',
  [ID.metaSummaryTail]: '📝大总结尾部',
  [ID.metaOutline]: '📚生成大纲',
  [ID.metaOutlineTail]: '📚大纲尾部',
  [ID.theaterChild01]: '🪑结束花絮',
  [ID.theaterChild02]: '🎊拍摄彩蛋',
  [ID.theaterChild03]: '🎞️删减片段',
  [ID.theaterChild04]: '🎧导演音轨',
  [ID.theaterChild05]: '💞临时换角',
  [ID.theaterChild06]: '🃏人设互换',
  [ID.theaterChild07]: '📺恋综模式',
  [ID.theaterChild08]: '🚪走错片场',
  [ID.theaterChild09]: '🎤杀青访谈',
  [ID.theaterChild10]: '🔒角色日记',
  [ID.theaterChild11]: '🌀IF线',
  [ID.theaterChild12]: '🎮如果本集重来',
  [ID.theaterChild13]: '💭心声外放',
  [ID.theaterChild14]: '⏸️静止一帧 ',
  [ID.theaterChild15]: '🍭无厘头/纯糖段子',
  [ID.theaterChild16]: '🐾兽化日常',
  [ID.theaterChild17]: '🍼萌宝降临',
  [ID.theaterChild18]: '🌌平行宇宙大乱炖',
  [ID.theaterChild19]: '🎪神展开日常',
  [ID.theaterChild20]: '🧣物品会说话',
  [ID.theaterChild21]: '💤角色做梦',
  [ID.theaterChild22]: '💘相性100问',
});

/* 真实 V1028 里有、但旧 control-contract.json 没收录的四条取向条目。
   名字逐字取自 `D:\\ST酒馆\\data\\default-user\\OpenAI Settings\\余温V1028.json`（只读核对）。 */
export const V1028_EXTRA_PROMPTS = Object.freeze({
  [ID.nsfwCarnal]: '❤️‍🔥多写肉体',
  [ID.nsfwMoanGuide]: '🫦叫床指导',
  [ID.moanHeart]: '💗呻吟爱心',
  [ID.nsfwDirtyTalk]: '💋骚话指导',
});

const EMOJI_EDGE_RE = /^([\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{20E3}\s]+)/u;

export function emojiPrefix(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const match = raw.match(EMOJI_EDGE_RE);
  return match ? match[1].trim() : '';
}

export function withEmoji(icon, label) {
  const prefix = String(icon == null ? '' : icon).trim();
  const body = String(label == null ? '' : label).trim();
  if (!prefix || !body) return body;
  if (body.startsWith(prefix)) return body;
  return prefix + ' ' + body;
}

/* 所有本模块认识的条目（含隐藏总开关）——测试/统计用。 */
export const ALL_KNOWN_IDS = Object.freeze(Array.from(new Set(
  SECTIONS.flatMap(section => section.controls).flatMap(control => {
    if (!control) return [];
    if (control.kind === 'toggle' || control.kind === 'action') return [control.id];
    if (control.kind === 'radio' || control.kind === 'combo') return control.allIds.slice();
    if (control.kind === 'multi') return control.ids.slice();
    if (control.kind === 'comboToggle') return control.members.slice();
    if (control.kind === 'word') return [control.id];
    return [];
  }).concat([ID.choiceMaster, ...FIXED_SHORTCUT_IDS])
)));

export function isV1028Name(name) {
  return /V\s*1028/i.test(String(name == null ? '' : name));
}

/* --------------------------------------------------------------------------
   字数：与 contracts/length-edit.mjs 同一规则（两处同值，原子校验）。
   -------------------------------------------------------------------------- */
function allLengthMatches(content) {
  return [...String(content).matchAll(LENGTH_SENTENCE)];
}

export function readWordCount(content) {
  const matches = allLengthMatches(content);
  if (matches.length !== 2) {
    throw new Error(`字数要求：应有恰好两处，实际 ${matches.length} 处`);
  }
  const values = matches.map(m => Number(m[1]));
  if (values[0] !== values[1]) {
    throw new Error(`字数要求：两处数字不一致（${values[0]} / ${values[1]}）`);
  }
  return values[0];
}

export function validateWordCountEdit(beforeContent, afterContent, next) {
  const errors = [];
  let before = null;
  let after = null;
  try { before = readWordCount(beforeContent); } catch (e) { errors.push('改前：' + e.message); }
  try { after = readWordCount(afterContent); } catch (e) { errors.push('改后：' + e.message); }
  if (before !== null && after !== null && after !== next) {
    errors.push(`改后 ${after} 不等于目标 ${next}`);
  }
  const count = (s, re) => (String(s).match(re) || []).length;
  if (count(afterContent, /<length_rule>/g) !== 1) errors.push('<length_rule> 数量不为 1');
  if (count(afterContent, /<\/length_rule>/g) !== 1) errors.push('</length_rule> 数量不为 1');
  if (count(afterContent, /\{\{setvar::length_rule_cot::/g) !== 1) errors.push('length_rule_cot 数量不为 1');
  if (!String(afterContent).trimEnd().endsWith('}}')) errors.push('setvar 宏没有以 }} 收尾');
  const normalize = s => String(s).replace(LENGTH_SENTENCE, '- 字数要求:正文的字数控制在{N}字以上。');
  if (before !== null && after !== null && normalize(beforeContent) !== normalize(afterContent)) {
    errors.push('两处数字之外的正文被改动');
  }
  return { ok: errors.length === 0, errors, before, after };
}

export function applyWordCount(content, next) {
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error('字数必须是正整数');
  }
  const before = readWordCount(content);
  const out = String(content).replace(
    LENGTH_SENTENCE,
    () => `- 字数要求:正文的字数控制在${next}字以上。`,
  );
  const check = validateWordCountEdit(content, out, next);
  if (!check.ok) throw new Error('字数校验失败：' + check.errors.join('；'));
  return { content: out, before, after: next, replacements: 2 };
}

/* 固定常用/紧凑页用的短标签；不改变条目真名。 */
export const SHORT_LABELS = Object.freeze({
  [ID.bilingual]: '双语对白',
  [ID.localize]: '语境本土化',
  [ID.acid]: '酸涩矫正',
  [ID.platonic]: '柏拉图',
  [ID.paragraphAlt]: '长短段落交替',
  [ID.paragraphLong]: '长段落为主',
  [ID.dynamic]: '动态主体',
  [ID.nsfwCarnal]: '多写肉体',
  [ID.nsfwMoanGuide]: '叫床指导',
  [ID.moanHeart]: '呻吟爱心',
  [ID.nsfwDirtyTalk]: '骚话指导',
  [ID.landing]: '等待回应',
  [ID.critique]: '毒舌自检',
  [ID.scene]: '开幕场记',
  [ID.seven]: '中插吐槽',
  [ID.nsfwSnapshot]: '状态快照',
  [ID.danmaku]: '弹幕评论',
  [ID.notes]: '备忘录',
  [ID.worldEvents]: '世界支线',
  [ID.summary]: '剧情摘要',
  [ID.mutter]: '碎碎念',
  [ID.theaterHtml]: '剧场 HTML',
  [ID.theaterRandom]: '随机小剧场',
  [ID.theaterParent]: '固定剧场 2',
  [ID.mainline]: '主线',
  [ID.romance]: '感情线',
  [ID.antiRush]: '防秒车',
  [ID.hook]: '剧情钩子',
  [ID.niah]: '防道歉',
  [ID.break1]: '破限 1',
  [ID.break2]: '破限 2',
  [ID.summon]: '召唤本体',
  [ID.metaSummary]: '大总结',
  [ID.metaOutline]: '生成大纲',
});

export function shortLabelFor(id) {
  const short = SHORT_LABELS[id];
  if (short) return short;
  const known = PROMPT_NAMES[id];
  if (!known) return String(id || '');
  return known.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() || known;
}

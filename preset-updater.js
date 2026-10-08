/**
 * 预设更新器 · 主入口（v0.2）
 *
 * 用法：在「扩展设置」里像别的分页一样直接用 ——
 *   ① 你的预设（下拉已安装 / 选文件） ② 新版预设（同上，也能拖文件） ③ 官方旧版（可选，推荐）
 *   → 点「开始对比」才弹出结果窗口：左边逐条选，右边/展开区看「选后效果」，顶部标签页看顺序对比
 *   → 一键生成新预设（绝不覆盖原来的；默认自动备份）
 * 依赖：preset-merge.js（纯逻辑内核，可单测）
 */
import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { Popup, POPUP_RESULT } from '../../../popup.js';   // ★S1-2：危险动作的确认走酒馆原生弹窗（与商店同一个入口）
import * as PM from './preset-merge.js';

const EXT = 'preset_updater';
/* ★W23 收口（2026-09-25 · 发布准备）：v5.3.18 → **v5.3.19**（更新器三 BUG + 四处文案 + 判据矩阵全维 + 内核 6 行"挑到一半" + 两个触摸目标；与 index.js 的 updaterBuild 成对升） */
/* ★W32 收口（2026-09-25 · 发布准备 · 三戳同升）：v5.3.19 → **v5.3.20**（W29 作者拍板「要」：「挑到一半」从拦阻改确认框（doGenerate / stitchIntoCurrent 两处运行期门禁）+ 按裁定走「甲」放开底栏 #ywpu-generate / #ywpu-stitch 的 blocked 这一个禁用原因（pv 与 canStitch 照旧禁用）；内核判据一个字没改；与 index.js 的 updaterBuild 成对升） */
/* ★W44 收口（2026-09-26 · 发布准备 · 三戳同升）：v5.3.20 → **v5.3.21**（W43 全插件术语统一：把 ONLY_MINE 那一档的旧说法统一成「只有我有」共 72 处 —— 本文件 62 处 + 本目录 preset-updater.css 2 处 + 内核 preset-merge.js 8 处；只改字面，标识符/键名/class/data-属性一个字节没动；与 index.js 的 updaterBuild 成对升） */
/* ★W60 收口（2026-09-27 · 发布准备 · 三戳同升）：v5.3.21 → **v5.3.22**（**W58 更新器一件**：三个步骤框的说明精简 —— 删掉三处标题行括注「（从已安装预设里选）」与 ② 那处「（可拖文件进来）」，① ② 各加一枚「（必选）」小标、③ 加「（可选）」，顶部那句补「可下拉选择，可导入文件。」；拖放 / 下拉 / 标签功能一个都没动。那波的业务改动由 W58 自己交付，**本波只升戳、业务逻辑一个字没改**；与 index.js 的 updaterBuild 成对升） */
/* ★W94 收口（2026-10-06 · 发布准备 · 三戳同升）：v5.3.22 → **v5.3.23**（**F3 派单的三处修**：① ② 槽位副标题按 S.nextFrom 走 —— 商店"缝入"那条路上 ② 是"你这份 + 这张卡的改动"、不再写死「作者刚发的那份」（那是误读成"我 vs 官方"的直接诱因）；② 商店路进对比页**默认档 = 「待我处理」**（那几处改动本来埋在 39/115/142 行、首屏看不见），更新器自己那条路默认档一个字没动；③ 把 analyze().notice **真渲染出来** + 把"被这次对比动到的隐藏条目"点名（内核语义一个字没改，落盘口径不变）。同批还改了 preset-updater.css 的 .ywpu-notices（收一行 + 热区 26px）；与 index.js 的 updaterBuild 成对升） */
/* ★W95 收口（2026-10-06 · 发布准备 · 三戳同升）：v5.3.23 → **v5.3.24**（**W95 派单 = 更新器对比页的一处去重+跳转、来源块两处文案、正则块整套重做、一处黑话改人话**：① 页顶提示条改前"收起那行"与"点开正文第一行"**逐字相同**（作者："怎么点进去是一个重复的话？"）⇒ 收起改短标题（原句前半截）、正文照旧整句并多一段"为什么不确定"，每句配一颗「跳过去 ▸」（真鼠标实测：切页签 + 滚到那一条 + 展开 + 闪一下）；② 「不懂用法？点此展开看说明」⇒**「展开」**；③ 来源块的「作者备注」小标**整颗删掉**（备注正文一个字没少，点开就看得到）；④ 正则块照作者原话重做：**收起态只留大标题 + 那排选择**（查找/替换那些具体内容一律 `display:none`、不占屏）、展开态改**上下两组**（上「旧版」红底 / 下「新版」绿底，复用条目侧 `.ywpu-grp` 骨架）、**"圆角左边条"那圈弧形两处都去掉**、选择框按"只改名字 / 只改内容 / 名字+内容都改"三档适配（只改名那档不再给会重复跑的「两条都留」）；⑤ `编辑时也跑`（ST 的 runOnEdit）⇒ 人话**「你改消息时也跑一遍」**（内核 `regexFieldDiff` 那条标签同改，只动字面）。★内核语义/落盘口径一个字节没改（`preset-merge.js` 只改了那一条字段标签的字面）；与 index.js 的 updaterBuild 成对升） */
/* ★W101 收口（2026-10-06 · 发布准备 · 三戳同升）：v5.3.26 → **v5.3.27**（**W101 = 作者实测八条**：甲①~⑤ 条目侧精简与重排（删行里那对 On→Off 牌子 / 开关两块的值改 ON·OFF / 删「改名：…→…」那行 / 展开区改成「①用我的·保存为两版·用新版 → ②还有N处没选 → ③名字变化 → ④开关变化 → ⑤内容变化」/ 删「点有底色的地方 = 换成另一边」）；乙⑥ 正则「同一处画两遍」的真 BUG（根因 = preset-merge.js 的 regexFieldDiff 把 scriptName/disabled 也当更改内容推了进来 ⇒ 与上面那两个选择块重复；已剔掉 ⇒ 各维恰好 1 处、那个外面没法选择的 On→Off 牌子也删了）；乙⑦ 正则侧那两组**真的能点**了（data-rxuse：点=选 / 再点=取消 / 盖章 + 变暗，与条目逐字同一套；每行加一颗「还有 N 处没选」）；丙⑧ 当前筛选一眼可见（明写「当前：X」+ 选中那颗加内描边与 ✓）。业务改动由 W101 交付，与 index.js 的 updaterBuild 成对升） */
/* ★★W110 收口（2026-10-07 · 作者四条 · 更新器两件 + 商店一件）：v5.3.32 → **v5.3.33**（
   ① **顶部「范围开关 + 筛选」逻辑重捋**（作者原话："点击全部 它会默认帮我选择预设条目和正则条目 然后再点击一次全部的话
      它会帮我取消掉前面两个条目"）：「全部」升格为**主开关** —— 点一下 = 两摊都摊开 + 行筛选清回「全看」；
      再点一下 = 两摊都收成折叠条；它的亮灭**由状态派生**（两摊都开 + 行筛选 all）。行筛选 chips 的老语义
      （单选 / 点自己 = 取消回全看）一个字没变；两颗范围开关照旧各自独立。
   ② **两根折叠条永远不消失**（作者："我展开了之后 我没有办法再点击那个折叠条帮它缩起来 因为那个折叠条消失了……
      但是这时候我点正则条目 它却没有这个折叠条 你要做一个和那个预设条目一模一样的折叠条"）：
      条目侧 / 正则侧各一根常驻条（同一套 .ywpu-scopebar 视觉，同句式「预设条目 N 条 · 需要你选 M 条」/
      「正则条目 N 条 · 需要你选 M 条」）；收起态 = 只有这根条，展开态 = 它当列表头、下面直接就是行；
      点条 = 收起/展开那一摊，与顶部对应范围开关**同一个状态键**（双向同步）。W107 口径守住：条里只有一颗按钮，
      老工具栏形态（折叠颗 / 一键四颗 / 第二排筛选）仍恰好 0。
   ③ **「空展开」修掉**（作者："有一些只有一行标题 然后那个里边的具体内容又比较短……它是一个空展开……
      一长一短一长一短 怪怪 但实际上没有更多的内容"）：真预设对里 17~18 条「结构标记」条目正文是空的
      （└──NSFW──┘ / ──────────── 那一族）—— 现在**无可展开内容的条目不再画展开三角、点行头一个像素都不动**
      （不重绘、不空展开，长度抖动没有来源）；有内容的照旧展开（一行短正文照旧可展开）。
      本波业务改动由 W110 交付；与 index.js 的 updaterBuild 成对升） */
/* ★★W111 收口（2026-10-07 · 作者"正则缝入要和预设条目一起统一" · 五处判据统一成"条目 + 正则一起算"）：
   v5.3.33 → **v5.3.34**（作者原话："我点击一个正则的卡片缝入 里面不是默认点击了待我处理 而且取消点击后
   我发现这些被筛选的内容放在所有条目的最下面……你去和预设条目一起统一" + "点击缝入正则条目时 怎么这些一键按钮
   全部都不见了 我说了 能不能统一啊 统一控制啊"）：
   ① **默认档**（runAnalyze）：判据从"只数条目"改成**两摊一起算**（条目 needsChoice ∨ 正则 regexNeedsChoice）
      ⇒ 正则卡开完就停在「待我处理」（W94 只做了条目那半）；W94 的边界（两边都不用选 ⇒ 仍「全部」）不动。
   ② **一键四颗的总开关**（renderResult 的 chooseable）：同样两摊一起算 ⇒ 正则包不再整排不画。
   ③ **"主体是正则 ⇒ 把正则摆到眼前"**：那条意图（Wave G 起）从 defaultScopeOf **之前**搬到**之后**
      （当年就死在顺序上：紧跟的赋值把它盖掉）⇒ 条目堆收成一根条、正则当场在下面。
   ④ **正则侧一键补 `name` 一维**（与条目侧 W99-甲 逐字同一条纪律）：改前点完"一键选新版"，凡是改了名字的
      正则还挂着「待我处理」（实测 8 条 → 剩 1 条）；现在一次落干净（只剩"只有我有"那批，按 W14 归旁边两颗）。
   ⑤ **sideModeAllNow**：没有要选的那一摊不再参与判定 ⇒ 正则包上那两颗"一键"**点得亮、也取消得掉**
      （改前恒不亮、第二下变成又按一遍）。
   五处都只在"正则那摊"上生效（条目包的读数逐字不变）；业务改动由 W111 交付；与 index.js 的 updaterBuild 成对升） */
/* ★★W112 收口（2026-10-07 白天 · 作者："顺序这个你怎么还是没解决？那些缝进来要变动的 顺位本来在中间
   但是现在每一种都聚在一块" + 补一句："就是和之前预设条目一样的毛病 只有我有聚在一堆 新版新增聚在一堆
   而不是按照其在其中的对应顺序"）：v5.3.34 → **v5.3.35**（只动更新器；商店 / 工具箱本波没动）。
   · **根因**：正则块的行序只有「待我处理」那一档过了 `orderRows()`（W99-丁 修的那一支）；
     「全部」与"各分类筛选"两支**直接吃 `listItems`** = 内核 `analyzeRegexes` 的产物顺序
     = [配上的对…] + [只有我有…] + [新版新增…] ⇒ 同一类整批挨在一起；而它们行上的「第 N 位」徽标
     说的是**中间**的位次（实测：4 条缝进来的新版正则被堆在第 51~54 行，徽标却说它们在**第 35/41/42/47 位**）。
   · **修法（最小改动，一处）**：`showRows` 改成**每一档都过 `orderRows()`** ⇒ 三档同一把尺子（按最终清单位次
     升序；算不出位次的照旧接在后、徽标照旧不画）。条目侧那两处**本来就对**（实测：条目「全部」档 133 行自然位
     0→…→150 单调；写盘产物里那 3 条改动条目仍在原位 33/33、76/76、151/151）。
   · **写盘产物一个字没动**：实测产物正则清单 = 内核最终清单 54/54 逐条相同；每行的「第 N 位」按脚本 id 逐条核 = 产物里的位次。
   · **顺带查过、结论"不改"**：`orderRows` 里"算不出位次 → 接在最后"那支兜底 —— 探针用产品真按钮点过
     「两条都留」4 条 + 「不要」4 条，仍然 **0/54 行**算不出位次（`use:both` 的旧版副本换了 id）⇒
     按"没有读数证明要改"这条纪律，那里一个字都没改。
   读数 / 假证（把改前形态塞回副本 ⇒ A-2 / A′-3 / A′-6 三条当场翻红）/ 回归见 waveW112-缝入顺位与聚块-日间.md；
   与 index.js 的 updaterBuild 成对升） */
const VERSION = '5.3.35';   // 更新器模块版本（随工具箱一起发布）
/** 构建戳：每次改完把这个号加一 —— 界面上会显示出来，方便确认"刷新后看到的是不是新版"
 *  ★2026-09-21 这一轮（R9 · 五份评审交叉批次，台账 §S 的 6 条更新器项）：**死路/静默失败 + 紧凑度**
 *    · **S1-2 ★**：5 处 `window.confirm` **全部收敛到酒馆原生 `Popup.show.confirm`**（`askYesX` / `askYes`）——
 *      浏览器勾过"阻止此页面创建更多对话框"之后，老写法**直接返回 false ⇒ 按钮点了完全没反应、一句提示都没有**。
 *      现在：原生弹窗取不到就 toast 说清"弹不出确认框、这一步没做"；点「算了」/Esc 一律**补一句 toast**（绝不静默）。
 *      同时把「同时自动备份」勾选框**搬进确认框本体**（`extraHtml` + `extraId` + `extraOut`）——退路和危险动作同一次交互；
 *      底栏那颗已经删掉（底栏因此也少一行）。
 *    · **S1-5**：生成新预设/应用更新包的成功文案原来写"到 设置 → 对话补全 的预设下拉里选它即可"——**是错的**：
 *      ST 的 `preset-manager.js updateList()` 保存后**当场把当前预设切到刚存的那份**（两个分支都 `trigger('change')`）。
 *      改成按 `afterSaveSwitchState()` **实测**说话（已帮你切过去了 / 如实让你去选 / 读不到就说保守话）。
 *    · **S2-1**：对比页首屏瘦身 —— 「位置待定」两个块**合一**（灰蓝 `storeBarHtml` 那两句并进琥珀块的正文 + `title`；
 *      内核原话/原来是挂在谁后面/三条出路全部折进 `title`）；**来源块可折起**（`<details>`，**默认收起**）——
 *      ★**U14（2026-09-22 深夜 · 台账 §BO-7 裁决点改了口径）**：BO-7 一度改成"默认展开"，但那样会**超首屏硬指标**
 *      （PC 首行距顶 35.5%~40.6% / 手机 48.2%~53.6%，见 `srcBarHtml` 那段注释），**已回退**成默认收起 +
 *      收起态在 summary 行右侧一句话「展开」（★W95 ②：作者要求把原句缩成两个字）（`.ywpu-src-tip`，不是按钮）；
 *      里层「看完整用途说明」仍收起（首屏指标仍是 PC ≤30% / 手机 ≤40%）；
 *      **工具条吸顶**（`#ywpu-toolbar` position:sticky，不新增滚动容器）。
 *    · **S2-2**：底栏状态区**收成一行**（三方/两方 + 顺序 + 四格计数并成一句小字，窄屏 ellipsis 不换行）；
 *      「缝入=直接改①」的后果说明**条件化**（勾了备份就不显示；只留一行 ⚠ 覆盖①「X」· 默认不备份）。
 *      ★**Wave W8（2026-09-24 · 作者第 21 批 §FE-C1）**：那颗角标作者说"有点多余" ⇒ **整块删掉**了
 *      （"默认不备份"改由按钮 title + 确认框正文 + 缝完的 toast 三处接着说，清单见 `renderFoot` 里那段注释）。
 *    · **S2-3**：总览页手机行收成一行 —— `从第 N 位挪来` 的参照系从"纯内核顺序"改成"自动顺序（含位置待定置顶）"
 *      （原来只要有 1 条位置待定，后面**所有**行都印这句噪声）；"没事发生"的行加 `.ywpu-plain`（窄屏收掉状态列/标记列，只留行尾一颗弱色圆点）。
 *    · **S2-4**：批量条**没勾选时压成一行**（一句灰字提示 + 全选 + ＋新建条目 + 筛选有变化的 + 看顺序对比）；
 *      批量动作（`.ywpu-bulk`）只加 CSS 收起、**DOM 里十颗按钮一颗不少**（程序化 click 与老断言照旧命中）。
 *    → 与 `index.js` 的 `updaterBuild` 一起升到 **v5.3.1**（两边必须一致，否则用户看不到新版）。
 *  ★2026-09-21 这一轮（定稿方案 §22）：**非余温预设的缝入** ——
 *    ① 页顶**来源块**（卡片标题 + 用途备注 + 出处；更新包/云端路同一个组件）；
 *    ② 锚点整条找不到的新增条目 = **位置待定**：说清"原来挂在作者那份的谁后面"、**默认放到顺序表最上面**、逐条标徽标；
 *    ③ 用户可改：顺序页行尾 + 条目编辑页展开区的「插在哪一条后面」（下拉带搜索）+ **条目编辑页也能拖**
 *       （全都走 `moveAfter` + `S.orderOverride` 这一条路；顺序页看到的就是写盘的那份）。
 *    → 跟着 `index.js` 的 `updaterBuild` 一起升到 v5.1.0（两边必须一致，否则用户看不到新版）。
 *  ★2026-09-21 这一轮（定稿方案 §24 · audit-p12 复查修复）：
 *    · **P1-4**："品牌色当文字"那一族全换成 `-ink` 档（品牌色混 62% 正文色）—— 浅色主题上原来只有 1.41~2.29；
 *    · **P2-6**：手动「开始对比」清 `S.orderOverride`（上一轮手选的顺序跨会话泄漏，写盘还会按旧顺序落）；
 *    · **D16**：「内核原话：…」从正文折进 `title`（悬停才看），正文只留人话。
 *    → 与 `index.js` 的 `updaterBuild` 一起升到 **v5.2.0**。
 *  ★2026-09-21 这一轮（R6-e · 作者第三批反馈 B/M）：
 *    · **B11**：底栏「生成新预设 / 缝入当前预设」永远同一行（窄屏也一起下去，不再一上一下）；
 *    · **B12**：★「缝入当前预设」**默认不备份** —— 旁边一个**默认不勾**的「同时自动备份」，
 *      勾了才"先备份再覆盖"，不勾就直接覆盖；读不到原文 / 写失败一律**一个字都不写**（`stitchWrite` 的 `backup` 参数）；
 *    · **B13+B14+M2**：拖动改口径 —— **不展开、在条目上长按（400ms）就进拖动**（旧「拖我换位置」那块作废），
 *      拖动中即时可见（影子 + 落点线 + "松手放到第 N 位"），松手后可**撤销拖动**（回到拖动前的初始位置）；
 *      总览页拖动给了"拿起来了"的明显反馈（原位虚化 + 影子抬起 + 落点加粗 + 提示条高亮）；
 *    · **M1**：勾选旧/新版后**不许跳滚动**（重绘时把"用户正看着的那个块"钉回原位，输入框/折块状态一并还原）；
 *    · **M3**：来源块里的预设名换成彩色（`缝进〈…〉` / `来自预设〈…〉`）；
 *    · **M11（跨批契约）**：支持 `openStore({…, preview:true})` 与 `openStorePseudo({…})` —— 对比页照常渲染，
 *      但**所有会改盘的按钮失效并标「（预览）」**，`doGenerate/stitchIntoCurrent/applyPatchAndSave/exportPatch`
 *      四个写盘口在 preview 模式下一律直接返回（**绝不写盘**）。
 *    → 与 `index.js` 的 `updaterBuild` 一起升到 **v5.3.0**。 */
/* ★2026-09-22 收口：v5.3.3 → **v5.3.4**（与 index.js 的 updaterBuild 一起升） */
/* ★2026-09-22 收口：v5.3.4 → v5.3.5（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-22：v5.3.5 → v5.3.6（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-22：v5.3.6 → v5.3.7（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-22：v5.3.7 → v5.3.8（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-23：v5.3.8 → v5.3.9（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-23：v5.3.9 → v5.3.10（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-23：v5.3.10 → v5.3.11（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-23：v5.3.11 → v5.3.12（与 index.js 的 updaterBuild 一起升） */
/* 2026-09-23：v5.3.12 → v5.3.13（U17 九条 + 两组底色修复） */
/* 2026-09-23（夜间 · C7 对比度修复）：v5.3.13 未升号 —— 修的是"两组底色上的字"那三处（见 §C7）：
   ① 版名两条规则回到令牌族（`--ywd-del-ink/--ywd-add-ink`，色相不变、拿到整族兜底）；
   ② 兜底层判据修正：**没定过**这一条时（`data-decided="0"`）两组都没暗 ⇒ 那两块底上的字按**正文 4.5** 判
      （旧写法把它们当"故意调暗的装饰"按 3.0 判 ⇒ 放过 12 档浅色主题上 4.05~4.64 的版名）；
   ③ 最后一招按**实际底色**选白端/黑端（minimax），并在"整族一个色救不了所有人"时**按元素自己的底**分开挑。 */
/* ★W23 收口（2026-09-25 · 发布准备）：v5.3.18 → **v5.3.19**（与 index.js 的 updaterBuild 成对升） */
/* ★W32 收口（2026-09-25 · 发布准备 · 三戳同升）：v5.3.19 → **v5.3.20**（与 index.js 的 updaterBuild 成对升） */
/* ★W44 收口（2026-09-26 · 发布准备 · 三戳同升）：v5.3.20 → **v5.3.21**（W43 术语统一 72 处；本波只升戳、业务逻辑未改；与 index.js 的 updaterBuild 成对升） */
/* ★W60 收口（2026-09-27 · 发布准备 · 三戳同升）：v5.3.21 → **v5.3.22**（**W58 更新器一件**：三个步骤框的说明精简 —— 删掉三处标题行括注「（从已安装预设里选）」与 ② 那处「（可拖文件进来）」，① ② 各加一枚「（必选）」小标、③ 加「（可选）」，顶部那句补「可下拉选择，可导入文件。」；拖放 / 下拉 / 标签功能一个都没动。那波的业务改动由 W58 自己交付，**本波只升戳、业务逻辑一个字没改**；与 index.js 的 updaterBuild 成对升） */
/* ★W94 收口（2026-10-06 · 发布准备 · 三戳同升）：v5.3.22 → **v5.3.23**（**F3 派单的三处修**：① ② 槽位副标题按 S.nextFrom 走 —— 商店"缝入"那条路上 ② 是"你这份 + 这张卡的改动"、不再写死「作者刚发的那份」（那是误读成"我 vs 官方"的直接诱因）；② 商店路进对比页**默认档 = 「待我处理」**（那几处改动本来埋在 39/115/142 行、首屏看不见），更新器自己那条路默认档一个字没动；③ 把 analyze().notice **真渲染出来** + 把"被这次对比动到的隐藏条目"点名（内核语义一个字没改，落盘口径不变）。同批还改了 preset-updater.css 的 .ywpu-notices（收一行 + 热区 26px）；与 index.js 的 updaterBuild 成对升） */
/* ★W101 收口（2026-10-06 · 发布准备 · 三戳同升）：v5.3.26 → **v5.3.27**（**W101 = 作者实测八条**：甲①~⑤ 条目侧精简与重排（删行里那对 On→Off 牌子 / 开关两块的值改 ON·OFF / 删「改名：…→…」那行 / 展开区改成「①用我的·保存为两版·用新版 → ②还有N处没选 → ③名字变化 → ④开关变化 → ⑤内容变化」/ 删「点有底色的地方 = 换成另一边」）；乙⑥ 正则「同一处画两遍」的真 BUG（根因 = preset-merge.js 的 regexFieldDiff 把 scriptName/disabled 也当更改内容推了进来 ⇒ 与上面那两个选择块重复；已剔掉 ⇒ 各维恰好 1 处、那个外面没法选择的 On→Off 牌子也删了）；乙⑦ 正则侧那两组**真的能点**了（data-rxuse：点=选 / 再点=取消 / 盖章 + 变暗，与条目逐字同一套；每行加一颗「还有 N 处没选」）；丙⑧ 当前筛选一眼可见（明写「当前：X」+ 选中那颗加内描边与 ✓）。业务改动由 W101 交付，与 index.js 的 updaterBuild 成对升） */
const BUILD = 'v5.3.35';
const API_ID = 'openai';                       // 对话补全预设（用户只使用对话补全）

// ---------------------------------------------------------------- 设置

const defaultSettings = {
    enabled: true,
    backup: true,              // 生成前自动备份"我的预设"
    orderMode: 'next',         // next=顺序跟新版 | mine=顺序跟我的
    spliceOrder: 'mineFirst',  // 缝合默认顺序：我的在上
    accordion: true,           // 手风琴（默认开）：展开一条自动收起其它 —— 只渲染一条，手机不卡
    lastMineName: '',
    lastNextName: '',
    lastBaseName: '',
    /* ★Wave B2（plan §3.2③ 第 6 步 / §9.1）：识版本"带锁"的总开关 + "这手选是给哪份 ① 选的"指纹。
       · baseLock=false ⇒ 判据整个退回旧口径（不校验、不拦、**三方对比就点亮**）—— 一行回滚，不用回滚代码；
       · lastBaseFor = 手选那一刻 ① 的内容指纹（内核 full digest）；① 一变 ⇒ 这条手选自动作废（防假归属）。 */
    baseLock: true,
    lastBaseFor: '',
    appliedOfficial: '',       // ★P1：上次应用过的官方版本号（如 'V0824'）——§5.3 的门禁靠它判"跳代"，不靠内容 hash
    appliedOfficialAt: '',     // 上次应用的时间戳（nowStamp 格式）
    appliedOfficialFrom: '',   // 上次应用到的那份新预设名
    colors: {},            // 用户自选的 13 个颜色（空 = 用内置默认）
};

function getSettings() {
    if (!extension_settings[EXT]) extension_settings[EXT] = {};
    const s = extension_settings[EXT];
    for (const [k, v] of Object.entries(defaultSettings)) if (s[k] === undefined) s[k] = v;
    return s;
}
const saveSettings = () => saveSettingsDebounced();

// ---------------------------------------------------------------- 运行时状态

const S = {
    mine: null, mineName: '', mineFrom: '',      // mineFrom: 'preset' | 'file'
    next: null, nextName: '', nextFrom: '',
    base: null, baseName: '', baseFrom: '',
    analysis: null,
    /* ★W94（F3 修 C）：被这次对比**动到的"隐藏条目"**（不在顺序表里 ⇒ 对比列表看不到它们）
       —— `{changed:[{name,before,after}], dropped:[name], added:[name]}`；每次 `runAnalyze()` 现算
       （判据见 `hiddenTouchedOf`）。**纯展示**：决策表 / 落盘口径一个字都没碰。 */
    decisions: {},          // key -> {source, enabled, spliceOrder, spliceText}
    params: {},             // key -> 'next' | 'mine'
    orderMode: 'next',
    expanded: {},           // key -> true（展开「选后效果」）
    unpair: [],             // 用户手动拆开的"改名配对"key
    filter: 'pending',      // pending | add | mineOnly | renamed | author | mine | both | switch | empty | all
    posMap: null,           // key -> 预设里的位置（按预设顺序显示用）
    /* ★W19A ②（2026-09-25）：这张表**不再参与筛选**了 —— 改前 `visibleItems()` 挂了一句
       `|| !!S.keepVisible[it.key]`，于是每一档分类筛选（新版新增/只有我有/两边不同/开关不同/改了名字）
       都会夹进一堆"不属于这一档、只是你点过"的行（作者原话："我不管筛选哪一个 它都包含了所有
       我已经就是自己选过的那个条目"）。"处理完不要消失"这件事现在由「待我处理」那一档**精确**表达
       （`needsChoice && 已选`，见 visibleItems 里那一行）⇒ 这一份只剩**记账**（写盘前/复位时清），
       留在状态里是为了老脚本/老断言读得到（`__ywpu.state.keepVisible`），**没有第二个读者了**。 */
    keepVisible: {},        // 历史记账：刚处理过哪些条目（筛选已经不读它了，见上）
    curKey: null,           // 当前"停在"哪一条（展开/跳转都会记）→ 上一条/下一条 以它为锚点（v4.0）
    view: 'items',          // items | order
    search: '',
    busy: false,
    lastSaved: null,
    extraEntries: [],       // 用户自己新建/复制的条目（"缝预设"）：{id, name, content, afterIdent, enabled}
    patch: null,            // P1「📥 导入更新包文件」的运行时状态（见文件末尾那一节：pack/decisions/report/pick…）
    store: null,            // ★P7（§15）：这次对比是"从商店来的"（{cardId,title,kind,target,report}）——头部写来源 + 生成时绝不覆盖同名
    multiSel: false,        // 总览页多选模式
    newName: '',            // 用户给新预设起的名字（★重绘不能把它冲掉）
    lastStitch: null,       // ★§18：上次「缝入当前预设」的结果 {name, backupName, backedUp, at}（界面上留着"备份在哪"）
    selIdents: [],          // 总览页已选中的 identifier
    /* ★Wave W9-5（2026-09-24 · W9 查问题兵）：上一次 `renderOrderView()` **真的画出来**的那些 identifier
       （= 用户在当时那个筛选下看得见的行）。用途只有两处：`全选` 选谁、「已选 N 条」里"看不见的有几条"。
       判据与行渲染**同一行代码**（通过筛选后才 push），所以永远不会跟屏幕上不一致。 */
    orderVisibleIds: null,
    lastSel: null,
    /* ★R6-e（B/M 批）新增的四个状态 —— 都挂在 S 上，浏览器侧断言直接读 `__ywpu.state.xxx` */
    stitchBackup: false,    // ★B12：★S1-2 起=「缝入」确认框里那个勾的**默认值**（默认 false = 不备份；不写进 settings，每次开窗口都是不勾）
    dragUndo: null,         // ★B13d：可撤销的那次拖动 {ident, before, at}（before = **这一串拖动的第一下之前**那份 S.orderOverride；null = 本来没手动调过）
    /* ★W17C-2：条目侧那两颗"一键"的高亮**没有状态位**了 —— 由 `bulkSideModeOf(items, decisions)` 从决策表现算
       （原来这里有个 `bulkSide`，它会跟决策表脱节 ⇒ 高亮说谎，与正则侧同根因，见 `bulkSideModeOf` 的注释）。 */
    preview: false,         // ★M11：伪缝入（预览）模式 —— true 时**任何写盘口都不动盘**（按钮也标「（预览）」）
    drag: { on: false, ident: '', slot: 0 },   // ★B13c：拖动中的实时状态（给测试与界面"即时可见"用）
    storeBatch: null,       // ★F2：商店「一键更新全部」带过来的一批卡 {items, i, target, preview}（页顶进度条用它）
    /* ★R8（预设级正则）：内核已把"正则缝合"整条做完（analyzeRegexes / mergeRegexes），
       界面这一批只做**结构化预留** —— 真几何/交互由带浏览器的下一批验收（见 r8-kernel-status.md）。 */
    regexItems: null,       // analyzeRegexes() 的 items（null = 两边都没有正则，整块不渲染）
    regexStats: null,       // analyzeRegexes() 的 stats（页面标题那行用它）
    regexNotice: [],        // analyzeRegexes() 的 notice（"默认一条都不删""位置待定 N 条"这类人话）
    regexDecisions: {},     // key -> {use:'next'|'mine'|'both', enabled:'next'|'mine'}
    /* ★W107-②：本键**降级成只读镜像**（= `scopeRx` 开着且这块真画着）—— 产品不再读它（内层折叠已删，
       显示与否只看 `scopeRx`）；保留只是给老脚本/老探针读（`__ywpu.regex.open()` 也改读 scopeRx）。 */
    regexOpen: false,
    regexBase: null,        // 三方基准的正则清单（有才判得出"作者改的"还是"你改的"）
    /* ★Wave G（2026-09-23 夜间 · 作者实测报的三件事）新增的四个状态 —— 都挂在 S 上（浏览器断言直接读 `__ywpu.state.xxx`） */
    regexPlace: {},         // ⑤ key -> {id,name,find}（用户手动指定的"插在哪一条正则后面"；空 = 按内核自己判）
    regexPlaceOpts: [],     // ⑤ 手选插入点的候选（= 最终合并里真有的那些正则，按最终顺序；没有待定行时是 []）
    regexTouched: {},       // ④ key -> true（用户**亲手点过**这一行的按钮）——"还剩 N 条要你看"靠它才数得准
    regexSameOpen: false,   // ⑥ 正则块里"两边一样"那一批的折叠状态（就地重绘别把它弄回去）
    /* ★W95 ④（作者 2026-10-06）：**每一条正则**自己"点开没点开" —— key -> true。
       默认 `{}` = 全部收起（作者："不点进去时不显示里边的更改内容…只有点开才显示"，"不点开只显示大标题 + 下面那排选择"）。
       收起时藏起来的是 `.ywpu-rxmeta` / `.ywpu-opthint` / `.ywpu-rxwhy` / `.ywpu-rxdiff` / `.ywpu-rxpospick`（CSS 一条规则），
       留着的是大标题行与 `.ywpu-rxpick` 那排选择。放状态里 ⇒ 就地重绘（点按钮/换筛选档）不会把它弄回去。 */
    regexRowOpen: {},
    /* ★Wave H₂ ①（2026-09-24 · 作者第二十批："正则也要有顺序"）新增的两个状态（跟 Wave G 那四个同一个口径，浏览器断言直接读） */
    /* ★Wave W2 ①（2026-09-24 · 作者第 20 批）：`regexFilter` 改成**一整排筛选**（照抄条目区那一排）——
       默认值 `'pending'` = 作者要的「待我处理」（= 只看需要更改的）；点它自己一次 ⇒ `'all'`（显示全部）。
       其余取值 = `FILTERS` 里的 id（'add'/'mineOnly'/'both'/'switch'/'renamed'/'empty'）。
       ★W17C：那两颗"一键"的高亮**没有状态位**了 —— 由 `bulkRxModeOf(items, decisions, touched)` 从决策表现算
       （原来这里有个 `regexBulkSide`，它会跟决策表脱节 ⇒ 高亮说谎，见 `bulkRxModeOf` 的注释）。 */
    regexFilter: 'pending',
    regexPos: null,         // 位次表 {sig, byId:Map, byName:Map, total, normName}（`regexPosMapNow()` 算，见那边注释）
    itemsShown: false,      // ① 条目"一条都不用你选"时列表先收成一句；点「展开看全部」才铺开（false = 收起）
    /* ★W103（作者 2026-10-06 新一批）：顶部那一排的三件事 —— 都用 S 上的状态位（浏览器断言直接读 `__ywpu.state.xxx`）
       · `scopeItems` / `scopeRx`：两颗「预设条目 / 正则条目」范围开关（false = 这一块收起来）。
         ★W107-②：正则侧收起 = **什么都不画**（折叠条已删，放回来 = 顶上那颗再点一次）；且正则块没有"内层展开"了
         （`scopeRx` 开着 ⇒ 下面直接就是正则行）。
         默认值由 `defaultScopeOf()` 按作者给的三条规则算（整份 ⇒ 两个都勾；只改条目 ⇒ 只勾条目；只改正则 ⇒ 只勾正则）；
       · `headOpen`：窗口头那行「☁ 来自商店：《…》 · 缝进 X」的**展开**（标题长的时候点开看全文，默认收起）。 */
    scopeItems: true,
    scopeRx: true,
    headOpen: false,
    /* ★Wave B2（2026-09-23 夜间 · plan §3.1/§3.2/§3.3 · 识版本"带锁轻量版"）新增的四个状态
       —— 都挂在 S 上，浏览器侧断言直接读 `__ywpu.state.lock`（与 Wave G 那四个同一个口径）。 */
    lock: null,             // 三状态判定结果（lockVerdict 的产物）；null = 还没算（整块不渲染）
    lockOpen: false,        // ★Wave W2 ②：基准面板（那颗药丸的浮层）是不是开着 —— 重绘不许把它合上
    lockDeclared: '',       // 这次的"声明基准"（卡/包里的 baseVersion；手动路 = 用户手选那一版）
    lockWho: '这张卡',       // 话术里的"谁"（商店路 = 这张卡；手动路 = 你选的基准）
    lockBusy: '',           // 异步（取云端清单 / 取基准整份）时的一句人话；空 = 没在忙
    /* ★Wave E2：这次判定**还在等云端清单复核**吗（本机那几版先算出来的话**不许说死** ——
       正是 B1/plan 点名的假读数：本机那几版看着像，云端清单一到可能就翻了）。
       由 `lockRun` 置位、`lockRunCloud` 收尾时清掉；只影响**这一趟显示哪句话**，不改任何判据。 */
    lockPending: false,
    /* ★Wave W12：云端清单这一趟的**序号**（每次问 +1）—— "超时之后才回来"的那份只许补算到

       序号还对得上的那一趟上（否则会把上一轮 ①② 的判定盖到这一轮，正是 plan 里说的"假读数"）。 */
    lockCloudSeq: 0,
};
// ---------------------------------------------------------------- 小工具

const $el = (sel, root) => (root || document).querySelector(sel);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// opts 可选（3 个参数的老调法一个字没变）：§18「缝入当前预设」要报"备份到哪了"，那条留久一点
const toast = (kind, msg, opts) => {
    /* ★S3（文案审核 · 2026-09-21 实测）：toastr **不渲染 Markdown** —— 文案里写 `**不备份**` 会原样显示两个星号。
       一处改、全项目生效：进 toast 之前先把 `**x**` 剥成 `x`（商店侧传过来的卡片文案也可能带星号）。 */
    const clean = String(msg == null ? '' : msg).replace(/\*\*([^*]+)\*\*/g, '$1');
    // ★P11（审查 A5）：**显式** escapeHtml —— 这里不少消息里带着远端卡片的标题/署名（如「X」已拼成… 那句），
    //   以前全靠酒馆全局 `toastr.options.escapeHtml = true` 兜着。本模块所有 toast 都是纯文本
    //   （grep 过 `<b>/<br>/<span>` = 0 命中）→ 显式转义零副作用，且不再依赖宿主。
    try { toastr[kind](clean, '预设更新器', Object.assign({ timeOut: kind === 'error' ? 8000 : 4000, escapeHtml: true }, opts || {})); }
    catch (e) { console.log('[预设更新器]', kind, clean); }
};
const nowStamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const slotLabel = (slot) => slot === 'mine' ? '你的预设' : slot === 'next' ? '新版预设' : '官方旧版';

/* ---------------------------------------------------------------- ★S1-2（R9）：危险动作的统一确认入口
   为什么要有这一段（人性化评审 D3 / §C 第 8 条）：
    本模块原来有 **5 处 `window.confirm`**。Chrome/Edge 的用户一旦勾过"阻止此页面创建更多对话框"，
    `window.confirm()` 就**直接返回 false** —— 于是「生成新预设」「缝入当前预设」「导出更新包」「应用更新包」
    这些按钮**点了完全没反应、一句提示都没有**（用户唯一的结论是"这插件坏了"）。
   做法：收敛到酒馆原生 `Popup.show.confirm`（商店侧 `askYes` 同一套，异步、不冻住页面、也不挡 toast）。
     · 原生弹窗取不到（老酒馆 / 构建里没有 popup.js）→ **不硬撑、也不静默**：toast 说清"弹不出确认框、这一步没做"。
     · 原生弹窗里点「算了」/ Esc / 点遮罩 = `ok:false` —— 调用方**必须**按"取消"处理并给一句 toast（never silent）。
     · `extraHtml` 用来把「同时自动备份」这种**可选退路**放进确认框本体（人性化 §A③ 的改法：
       "一次交互里既能看清后果、又能当场补退路"）。勾选状态靠 `extraId` + 捕获期的 change 监听读回来。 */

/** 底层：跑一次确认，返回 `{ok, extra}`（要读勾选状态的地方用它）
 *  @param {string} header 弹窗标题
 *  @param {string[]|string} lines 正文（纯文本行；`**x**` 会渲染成真粗体 —— 原生弹窗不认 Markdown）
 *  @param {{ok?:string, cancel?:string, extraHtml?:string, extraId?:string, extraOut?:{on:boolean}}} [o]
 *  @returns {Promise<{ok:boolean, extra:boolean}>} */
async function askYesX(header, lines, o) {
    const opt = o || {};
    const arr = (Array.isArray(lines) ? lines : [lines]).filter(x => x != null && String(x) !== '');
    // ★远端文本（预设名 / 卡片标题 / 文件名）一律 esc() 再进弹窗（§1.7：陌生人文本不许当 HTML 解析）
    const html = arr.map(esc).join('<br>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') + (opt.extraHtml || '');
    let extra = opt.extraOut ? !!opt.extraOut.on : false;
    let hooked = null;
    if (opt.extraId) {
        hooked = (ev) => { const t = ev.target; if (t && t.id === opt.extraId) extra = !!t.checked; };
        document.addEventListener('change', hooked, true);   // 捕获期：弹窗什么时候关掉都不影响拿到最后一次勾选
    }
    try {
        if (typeof Popup !== 'function' || !Popup.show || typeof Popup.show.confirm !== 'function') throw new Error('这份酒馆没有 Popup.show.confirm');
        const r = await Popup.show.confirm(header, html, { okButton: opt.ok || '确定', cancelButton: opt.cancel || '算了' });
        return { ok: r === POPUP_RESULT.AFFIRMATIVE, extra };   // 1 = 点了确定；0 / null = 取消或 Esc
    } catch (e) {
        console.warn('[预设更新器] 原生确认弹窗用不了 —— 这一步先不做（不静默、也不硬撑）', e);
        toast('error', '弹不出确认框（' + ((e && e.message) || e) + '）—— 这一步没有做，你的预设一个字都没动。刷新页面再来一次。');
        return { ok: false, extra };
    } finally {
        if (hooked) document.removeEventListener('change', hooked, true);
        /* ★B12-fix（R9-i，真 BUG）：勾选状态**必须回写**给调用方传进来的那个对象。
           不写回的话，"读 extraOut.on 的调用方"永远只看得到**开窗那一刻的初值** —— 用户在弹窗里
           勾上「同时自动备份」，`ans.extra` 是 true，但 `extraOut.on` 还是 false ⇒ 勾了等于没勾
           （r9-h 终评实测：勾了 → 备份文件仍然不生成、`stitchBackup()` 报 false）。
           这里统一在 finally 里回写：弹窗中途被 Esc/点遮罩关掉也照样拿到"最后一次勾选"。 */
        if (opt.extraOut) opt.extraOut.on = !!extra;
    }
}
/** 只要是/否（要读"同时自动备份"那类勾选状态的用 askYesX） */
async function askYes(header, lines, o) { return (await askYesX(header, lines, o)).ok; }

/** 写盘成功之后"我现在在用哪份"？—— ST 的 preset-manager 保存后会 `updateList()`，
 *  **当场把当前预设切到刚存的那份**（`D:\ST酒馆\public\scripts\preset-manager.js` 的 `updateList()`：
 *  两个分支都 `$(this.select).val(...).trigger('change')`；`savePreset()` 里是同步调用的，await 回来就已经切好了）。
 *  ★S1-5（人性化 D5）：老文案写"到 设置 → 对话补全 的预设下拉里选它即可"是**错的** —— 用户会去下拉里
 *  找一份**已经被选中**的预设，找不到就怀疑没生效。这里**实测**一下再说话（读不到就说保守话，不瞎猜）。
 *  @returns {'switched'|'not'|'unknown'} */
function afterSaveSwitchState(name) {
    try {
        const pm = presetManager();
        if (!pm || typeof pm.getSelectedPresetName !== 'function') return 'unknown';
        return String(pm.getSelectedPresetName() || '') === String(name) ? 'switched' : 'not';
    } catch (e) { return 'unknown'; }
}
/** 写盘成功那条 toast 的后半句（"生成新预设"与"应用更新包"两条路共用） */
function savedWhereText(name, extra) {
    const st = afterSaveSwitchState(name);
    const tail = extra || '';
    if (st === 'switched') return '已经帮你切到「' + name + '」了' + tail;
    if (st === 'not') return '到 设置 → 对话补全 的预设下拉里选「' + name + '」就能用' + tail;
    return '已经存成「' + name + '」（酒馆一般会顺手把它切成当前预设；没切的话到 设置 → 对话补全 的下拉里选它）' + tail;
}

/** ST 的预设管理器（对话补全） */
function presetManager() {
    try {
        const ctx = window.SillyTavern?.getContext?.();
        return ctx?.getPresetManager ? ctx.getPresetManager(API_ID) : null;
    } catch (e) { console.warn('[预设更新器] 取预设管理器失败', e); return null; }
}

/** 已安装的对话补全预设名列表 */
function listPresetNames() {
    const pm = presetManager();
    try { return pm ? (pm.getAllPresets() || []) : []; } catch (e) { return []; }
}

/** 按名字读一份已安装预设（返回深拷贝，避免改到内存里的对象） */
function readPreset(name) {
    const pm = presetManager();
    if (!pm) throw new Error('取不到酒馆的预设管理器，请刷新页面重试');
    const list = pm.getPresetList(API_ID);
    const names = list.preset_names || {};
    for (const [idx, n] of Object.entries(names)) {
        if (n !== name) continue;
        const preset = list.presets?.[idx];
        if (!preset) break;
        return JSON.parse(JSON.stringify(preset));
    }
    const idx = pm.findPreset(name);
    const preset = idx !== undefined && idx !== null ? list.presets?.[idx] : null;
    if (!preset) throw new Error('找不到预设「' + name + '」');
    return JSON.parse(JSON.stringify(preset));
}

/* ==== ywpu-fresh-core:start（纯逻辑，别在这段里引用外面的东西 —— 探针会把这段单独抽出来跑）==== */
/** 规范化序列化（**只为"任何变动都反映到摘要上"**）：对象键排序、数组保序、类型写死。
 *  ★它**不做任何"算不算改了"的语义判定** —— 语义全部交给下面用到的内核函数
 *    （`presetFingerprint` / `entryFingerprint` / `normalizeName` / `regexFullSig`）；这里只管"把一份数据
 *    稳定地变成字符串"，同一份内容算两次一定一样。 */
function _w19aCanon(x) {
    if (x === null || x === undefined) return '\u2205';
    const t = typeof x;
    if (t === 'number') return 'n' + x;
    if (t === 'boolean') return x ? 'b1' : 'b0';
    if (t === 'string') return 's' + x;
    if (Array.isArray(x)) return '[' + x.map(_w19aCanon).join(',') + ']';
    if (t === 'object') { const ks = Object.keys(x).sort(); return '{' + ks.map(k => k + ':' + _w19aCanon(x[k])).join(',') + '}'; }
    return 'x' + String(x);
}
/** 预设里"除条目表 / 顺序表之外"的全部顶层字段（temperature / extensions 里那些 …）——
 *  逐键规范化进摘要 ⇒ 顶层任何一维变动都跑不掉。 */
function presetRestOf(preset) {
    const out = {};
    for (const k of Object.keys(preset || {})) {
        if (k === 'prompts' || k === 'prompt_order') continue;
        out[k] = preset[k];
    }
    return out;
}

/** ★W19A ①：一份预设的**全维内容摘要**（认内容，不认文件名/时间）。
 *  只回答一件事：**槽位里那份快照跟盘上现在那份还是不是同一份**。
 *
 *  ★W19A-2（2026-09-25 · 作者第 27 批实测"只修了一半"）：改前这里**只**用了内核的
 *    `PM.presetFingerprint(..., {full:true}).digest`，而那条整版摘要的元组是
 *    `[key, 正文哈希, 长度, orderIndex]`（`preset-merge.js` 的 `fullEntryTuples`）
 *    ⇒ **只认正文 / 条目集合 / 注入顺序**。于是作者实测："只有在里边修改字样的话它才会更新状态 …
 *      其他的都没有变"（开关、角色、注入位置/深度/顺序、触发词、禁止覆盖、顶层字段、正则清单全漏）。
 *  作者的要求（原话）："**所有东西 你不管是开关还是什么 只要有任何变动 它都要以最新的为准**"。
 *  ⇒ 现在的口径 = **五个维度全覆盖，每一项都用内核自己的权威件**（不新造第二套语义）：
 *    ① 条目集合：`PM.presetFingerprint(preset,{full:true}).digest`（内核认版本那把尺）；
 *    ② 逐条：`PM.entryFingerprint(raw)`（**内核判"算不算改了"用的就是它**：正文+角色+注入位置+深度）
 *       + `PM.normalizeName(name)` + 注入顺序 / 系统提示 / 禁止覆盖 / 触发词 / marker 这些"怎么注入"的字段；
 *    ③ 顺序表：每张表**逐个 identifier + enabled**（开关就在这儿；顺序表的增删改序也在这儿）；
 *    ④ 除条目表/顺序表之外的顶层字段（`temperature` / `extensions.*` …，规范化序列化）；
 *    ⑤ 正则清单：`PM.regexFullSig` 逐条（13 个字段全比，含 `disabled` 开关）。
 *  ★判据只有这一处：开对比前的重读（`rereadSlot`）与写盘前的防线（`mineChangedSinceAnalysis`）
 *    都调它 —— 不在这两处各写一份（本项目踩过"两处各写一份就分叉"）。
 *  ★返回值是**完整的规范串**（不另外做哈希压缩）：逐字节相等就是"没动过"，
 *    没有哈希碰撞的可能；几十 KB 的字符串比两次的开销可以忽略。
 *  读不出来（内核抛）→ `''`（= 判据拿不到 ⇒ 调用方按"不动"处理，绝不猜、绝不清空）。 */
function presetDigestOf(preset) {
    try {
        const p = preset || {};
        const parts = [];
        /* ① 条目集合（内核权威整版摘要） */
        const fp = PM.presetFingerprint(p, { full: true });
        parts.push('E' + String(fp.digest || fp.hash || ''));
        /* ② 逐条：内核条目指纹 + 其余"会影响怎么注入"的字段 */
        const list = Array.isArray(p.prompts) ? p.prompts : [];
        for (const e of list) {
            if (!e || typeof e !== 'object') { parts.push('P\u2205'); continue; }
            parts.push('P' + [
                String(e.identifier === undefined || e.identifier === null ? '' : e.identifier),
                PM.entryFingerprint(e),
                PM.normalizeName(e.name),
                e.injection_order === undefined || e.injection_order === null ? '' : e.injection_order,
                e.system_prompt === undefined ? '' : (e.system_prompt ? 1 : 0),
                e.forbid_overrides ? 1 : 0,
                Array.isArray(e.injection_trigger) ? e.injection_trigger.join('|') : (e.injection_trigger === undefined || e.injection_trigger === null ? '' : String(e.injection_trigger)),
                e.marker ? 1 : 0,
            ].join('\u0001'));
        }
        /* ③ 顺序表：逐个 identifier + enabled（开关 / 顺序表增删改序） */
        const orders = Array.isArray(p.prompt_order) ? p.prompt_order : [];
        for (const o of orders) {
            const arr = (o && Array.isArray(o.order)) ? o.order : [];
            parts.push('O' + String(o && o.character_id !== undefined ? o.character_id : '') + '\u0001'
                + arr.map(x => String(x && x.identifier) + (x && x.enabled === false ? '-' : '+')).join(','));
        }
        /* ④ 顶层其余字段（temperature / extensions.* …） */
        parts.push('T' + _w19aCanon(presetRestOf(p)));
        /* ⑤ 正则清单：内核 regexFullSig 逐条（13 个字段全比，含 disabled） */
        try {
            const rxs = PM.getRegexList(p) || [];
            for (const r of rxs) parts.push('R' + PM.regexFullSig(r, { withId: true }));
        } catch (e) { parts.push('R\u2205'); }
        return parts.join('\u0002');
    } catch (e) { return ''; }
}

/** ★W19A-2：摘要的**短标签**（8 位十六进制，FNV-1a 折叠）—— **只给 console 日志一个可读的读数**。
 *  ★它**不参与任何判定**：判定始终是 `presetDigestOf()` 那两个规范串**逐字节比较**
 *    （所以不存在"哈希碰撞导致漏判"的可能）。摘要本身几十 KB，日志里没法看，才要这个标签。 */
function presetDigestTag(preset) {
    const s = String(presetDigestOf(preset) || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
}

/** ★W19A ①：旧快照该不该被换掉？——**纯判据**（只吃两个摘要，不碰 DOM / IO / 时钟）。
 *  为什么需要（作者第 24 批 ① 原话）："……我进行了当前预设的一个修改……然后这时候我再点击一次那个缝入，
 *   然后在里面就完全没有能够对比出我刚才有自行修改的那个地方。"
 *  = `S.mine` 是**开对比那一刻**读进来的一份快照；用户中途回酒馆把那份预设改了 ⇒ 再开对比必须重读。
 *  · 新摘要读不出来（文件被删/坏了）→ false（**不动**：宁可留着手上这份，也不把状态清空）；
 *  · 两个摘要一模一样 → false（内容没变，省掉一次重算，界面上一个字不变）。 */
function slotNeedsReread(curDigest, freshDigest) {
    if (!freshDigest) return false;
    return String(curDigest || '') !== String(freshDigest);
}
/* ==== ywpu-fresh-core:end ==== */

/** ★Wave K1 · 顺带修复（2026-09-24 · 实测复现的真 BUG）：**读出来的这东西到底是不是一份能用的预设？**
 *  触发场景：用户那份预设文件**坏掉 / 被外部改坏**（实测现象：文件内容变成"一个 JSON 字符串"、没有 `prompts`）
 *    ⇒ 而 ST 的"当前预设"正指向它 ⇒ 挂载路上 `restoreSaved() → renderSource() → stateOf()` 读
 *      `o.prompts.length` **当场抛** ⇒ 卡片空白、`window.__ywpu` 永远不出现 = **更新器整块打不开**（不是"提示一下"）。
 *  口径（最小）：坏数据**只跳过它**（跟"这份预设被删了"同一条既有分支：`st[key]=''`），并把名字记进
 *    `S.badPresets` ⇒ 界面上给一句人话（`.ywpu-risk`，见 `renderSource()`）+ toast，**不静默**。
 *  正常预设：这个函数恒为 `true` ⇒ 与改动前**逐字节同表现**（读数见 `e2e/tmp/waveK1-badpreset.log`）。 */
function usablePreset(o) { return !!(o && Array.isArray(o.prompts)); }

/** 保存为新预设（走 ST 官方接口：/api/presets/save） */
async function savePreset(name, preset) {
    const pm = presetManager();
    if (!pm) throw new Error('取不到酒馆的预设管理器，请刷新页面重试');
    await pm.savePreset(name, preset);
}

/** 宽松解析 JSON（容忍 BOM / 前后废话） */
function parseJsonLoose(text) {
    const t = String(text ?? '').replace(/^\uFEFF/, '').trim();
    if (!t) throw new Error('文件是空的');
    try { return JSON.parse(t); } catch (e) { /* 继续 */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* 继续 */ } }
    throw new Error('不是合法的 JSON（确认导出的是对话补全预设的 .json）');
}

/** 下载 JSON 文件（备份用，不进酒馆预设列表，零污染） */
function downloadJson(filename, obj) {
    try {
        const blob = new Blob([JSON.stringify(obj, null, 4)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        return true;
    } catch (e) { console.warn('[预设更新器] 下载备份失败', e); return false; }
}

// ================================================================ 一、设置抽屉里的分页（入口）

/** 挂载到余温工具箱的一张卡片里（本插件作为工具箱的一个分页，不再单独占一个扩展） */
export function mountPresetUpdater(container) {
    if (!container || container.dataset.ywpuMounted) return;
    container.dataset.ywpuMounted = '1';
    container.innerHTML = `
<div id="ywpu-card" class="ywpu-box">
    <!-- ★文案审核 A0.5 #2/#3（2026-09-21）：面板里**不再重复标题**（工具箱那张卡上已经写着「预设更新器」）、
         也删掉"逐条比一比，挑着吃新内容"这种自造比喻。
         ★§BY-A（2026-09-23 · 作者第十七批）：**模块小版本号一律不许出现在界面上**（他第三次讲"把小分页里所有
         版本号删去"，2026-09-23 仍能在卡片上看到 v5.3.12）—— 这一行原来就是那颗胶囊，整行删掉。
         配套的 3 条样式（.ywpu-ver / .ywpu-box-t.ywpu-boxt-min / .ywpu-box-t）一起从 CSS 清掉（不留孤儿）。
         版本号只留在：代码常量 VERSION/BUILD、挂载 console 日志、调试出口 —— 都是"内部更新用"，用户看不到。 -->
    <div class="ywpu-hint">
        默认只生成新预设，<b>不动你现在这份</b>。可下拉选择，可导入文件。
    </div>
    <div id="ywpu-sec-source"></div>
    <div class="ywpu-launch">
        <button class="ywpu-btn ywpu-primary" id="ywpu-run">开始对比</button>
    </div>
    <!-- ★§BY-D：离线那条路（别人直接发你一个 .json 更新包）**不删，折进「离线 / 高级」折叠**：
         作者说这颗"一般不用" ⇒ 不该在主行上占一颗按钮；但**删了他就再也没有离线入口**
         （云端那条要联网、要有云端整份预设）⇒ 收进折叠：用的时候点开，还是原来那颗按钮、文案与 title 一个字没改。 -->
    <details class="ywpu-cadv" id="ywpu-cadv">
        <summary>离线 / 高级</summary>
        <div class="ywpu-row">
            <button class="ywpu-btn ywpu-mini" id="ywpu-check-patch" title="离线兜底（跟云端那条路没关系）：别人直接发给你一个「更新包」小文件（.json）时点这里 —— 只列这一版改了哪些地方，逐条确认后另存成新预设">📥 导入更新包文件</button>
            <span class="ywpu-note">别人用「导出更新包」发给你的 .json 小文件走这里（不联网）</span>
            <input type="file" id="ywpu-patch-input" accept=".json,application/json" style="display:none">
        </div>
    </details>
</div>`;
    getSettings();
    applyColors();
    restoreSaved();
    renderSource();
    /* ★Wave K1 · 顺带修复：读不出内容的预设（文件坏了/被外部改过）**当场说一句人话** ——
       常驻那一行在来源区（`.ywpu-risk`，见 renderSource），这里再补一条 toast（打开面板就能看见）。 */
    if (S.badPresets && S.badPresets.length) {
        toast('warning', '读不出「' + S.badPresets.join('、') + '」的内容（这份预设文件可能坏了、或被外部改过）—— 这次先跳过它，你可以另选一份。');
    }
    buildWindow();
    watchThemeChange();     // ★A-2：换主题当场重算（挂一次；回调 = 既有的 applyAutoInkAll）
    container.querySelector('#ywpu-run').addEventListener('click', () => startCompare());
    // 📥 用户侧入口（P1）：选一个更新包文件 → 认版本 → 确认页 → 应用并另存（见文件末尾那一节）
    const patchInput = container.querySelector('#ywpu-patch-input');
    container.querySelector('#ywpu-check-patch').addEventListener('click', () => {
        if (!S.mine) { toast('warning', '先在「① 你的预设」里选你现在正在用的那份（也可以点「选文件…」），再检查更新'); return; }
        patchInput.value = ''; patchInput.click();
    });
    patchInput.addEventListener('change', async function () {
        const f = this.files?.[0]; this.value = '';
        if (!f) return;
        try { acceptPatchFile(f.name, await f.text()); }
        catch (e) { toast('error', '读文件失败：' + (e?.message || e)); console.warn('[预设更新器] 读更新包失败', e); }
    });
    // 调试出口（e2e / 控制台自检用）
    window.__ywpu = {
        version: VERSION,
        open: openWindow,
        close: closeWindow,
        start: startCompare,
        state: S,
        core: PM,
        setMine: (obj, name) => acceptPreset(obj, 'mine', name || ''),
        setNext: (obj, name) => acceptPreset(obj, 'next', name || ''),
        setBase: (obj, name) => acceptPreset(obj, 'base', name || ''),
        analyze: () => runAnalyze(false),
        generate: doGenerate,
        readPreset,
        listPresetNames,
        /* ★P13 测试卫生：把「重列三槽位下拉」暴露出来 —— `run-updater-e2e` 是先 `pm.savePreset('E2E-我的',…)`
           再选它，而下拉是**面板挂载时**列一次的（真实用户那边：刚存进酒馆的预设要重新打开面板/换个下拉才会出现）。
           没有这个口子，测试只能靠"上一轮留下的同名文件恰好在启动时就在磁盘上"才过（本轮清了副本的 e2e 产物，
           当场红成"下拉里没有 E2E-我的"）—— 那是**测试的顺序依赖**，不是产品问题。 */
        renderSource,
        restoreSaved,
        // P1 官方推送：作者侧导出更新包 / 用户侧检查更新（e2e/run-updater-patch.js 直接调它们）
        exportPatch,
        acceptPatchFile,
        // ★§18「缝入当前预设」：按钮入口 + 纯写盘核心 + 备份名（e2e 与纯 Node 探针都直接调它们）
        stitch: () => stitchIntoCurrent(),
        stitchWrite,
        stitchBackupName,
        patchDecision: (key, use, customText) => setPatchDecision(key, use, customText),
        applyPatchNow: () => applyPatchAndSave(),
        closePatch: () => closePatchWindow(),
        patchPack: (o) => PM.patchPack(o),
        // P7 商店 → 更新器（§15；e2e/run-store-e2e.js 直接调它们验"三种包都能进这条路"）
        store: {
            open: openStorePack,                 // 商店点「到更新器里挑」调的**同一个函数**
            pseudo: openStorePseudo,             // ★M11：伪缝入（预览）
            batch: openStoreBatch,               // ★F2：一键更新全部（只打开，不写盘）
            batchAdvance: storeBatchAdvance,
            toPatch: storePackToPatch,
            toNext: storePackToNext,
            defaultName: storeDefaultName,
            state: () => S.store,
            bar: () => storeBarHtml(),
        },
        /* ★R6-e（B/M 批）给浏览器侧用的口子 —— 探针不必去猜内部结构 */
        preview: () => !!S.preview,              // ★M11：现在是不是预览（伪缝入）
        /* ★W19A-2：**"手上那份是不是最新"这一族**的只读口子（浏览器侧探针/下一班排查直接用）：
           `changed()` = 写盘前防线那一句（true = ① 在开对比之后被改过、这次不写盘）；
           `reread()` = 按盘上现在那份重读一遍（返回 {ok, changed, why}）；
           `digest(p)` / `tag(p)` = 摘要 / 摘要短标签（不传 p 就用 ① 现在那份）。 */
        fresh: {
            changed: () => mineChangedSinceAnalysis(),
            reread: () => rereadSlot('mine'),
            digest: (p) => presetDigestOf(p || S.mine),
            tag: (p) => presetDigestTag(p || S.mine),
            slot: (s) => rereadSlot(s),
        },
        stitchBackup: (v) => { if (v !== undefined) { S.stitchBackup = !!v; renderFoot(); } return !!S.stitchBackup; },
        dragUndo: () => (S.dragUndo ? { ...S.dragUndo } : null),
        /* ★§BY-I：两颗"一键"按钮 —— 点法（bulkApply，含"取消全选"那一支）与**取值规则**（bulkDecisions 纯函数） */
        bulk: { apply: bulkApply, decisions: bulkDecisions, defaults: defaultDecisions, side: () => bulkSideModeOf(S.analysis ? S.analysis.items : [], S.decisions), modeOf: bulkSideModeOf },
        /* ★Wave G（2026-09-23 夜间）：正则块那几个**给 e2e 读的口子** —— 让探针读"产品真正会交给内核的那一份"，
           而不是自己复刻一遍（复刻的探针会在产品改口径后继续验旧逻辑，等于没验）。 */
        regex: {
            arg: () => regexArgForBuild(),                 // 生成/缝入时交给 buildMerged 的那一份（⑤ 手选的插入点已经合进去了）
            place: () => ({ ...(S.regexPlace || {}) }),     // 用户手选的"插在哪条后面"
            placeOpts: () => (S.regexPlaceOpts || []).slice(),
            touched: () => ({ ...(S.regexTouched || {}) }), // 亲手点过的行（④ 的计数靠它）
            collapsed: () => itemsCollapsed(),              // ① 条目区现在是收成一句吗
            /* ★★W107-②：`open()` 读/写的就是"**这块显示着吗**"（= `S.scopeRx !== false`）—— 内层折叠已删；
               写 false = 收起整块（与顶部那颗「正则条目」同一个键），写 true = 直接出行。 */
            open: (v) => { if (v !== undefined) S.scopeRx = !!v; return S.scopeRx !== false; },
            /* ★W95 ④：**每一条**正则"点开没点开"的读写口子（探针读它 = 读产品真状态，不用猜 DOM）。
               `rowOpen()` 全量快照 / `rowOpen(key, true|false)` 设一条 / `rowOpen(null)` 清空（= 全收起）。 */
            rowOpen: (key, v) => {
                if (key === null) { S.regexRowOpen = {}; return {}; }
                if (key === undefined) return { ...(S.regexRowOpen || {}) };
                const m = { ...(S.regexRowOpen || {}) };
                if (v === false) delete m[String(key)]; else m[String(key)] = true;
                S.regexRowOpen = m;
                return { ...m };
            },
            /* ★Wave W2 ①：那排筛选与两颗"一键"的**读写口子**（探针不必点 DOM 也能读"产品真会用的那一份"） */
            filter: (v) => { if (v !== undefined) S.regexFilter = String(v); return String(S.regexFilter || 'pending'); },
            ui: () => regexFilterUI(),                      // 那一排的判定/计数/渲染件（就是条目区那几支函数）
            bulk: {
                apply: bulkRxApply,                        // 点法（含"再点同一颗 = 取消全选"与"先弹确认"两支）
                decisions: bulkRegexDecisions,             // 取值规则（纯函数）
                defaults: defaultRegexDecisions,           // "取消全选"回到的那份默认态
                loss: bulkRxLossOf,                        // 会丢多少活儿（确认框的判据）
                side: () => bulkRxModeOf(S.regexItems, S.regexDecisions, S.regexTouched),   // ★W17C：现算（不再是状态位）
            },
        },
        /* ★§BY-H：撤销记录怎么记（纯函数）—— 探针直接验"同一串拖动只保留最初那份 before" */
        /* ★Wave B2（识版本三状态 / 带锁）：探针与纯 Node 断言直接用这几个口子
           —— `verdict` 是**纯函数**（不碰 DOM、不联网），`state()` 读这一次的判定结果。 */
        lock: {
            state: () => S.lock,
            verdict: (mine, cands, declaredVer, o) => lockVerdict(mine, cands, declaredVer, o),
            recompute: (input) => recomputeWithBase(input),
            prepare: (o) => lockRun(o),
            pick: (from, value, obj) => applyLockChoice(from, value, obj),
            candidates: () => localBaseCandidates(),
            cloud: () => cloudBaseCandidates(),
            /* ★Wave E2：项1/2/3 的读数口子（**只读**）——
               `net` = 这次会话的取用记账（下载几次 / 走缓存几次 / 写失败几次）；
               `cached` = 缓存里那几版当候选（"本地优先"，零网络）；
               `pending` = 这次判定还在等云端复核吗；`restore` = 手动跑一次"启动恢复"（跨会话恢复用例）。 */
            net: () => Object.assign({}, lockNet),
            cached: () => cachedBaseCandidates(),
            pending: () => !!S.lockPending,
            restore: () => restoreSaved(),      // 跑一次"启动时恢复上次选择"（跨会话恢复用例用；正常由挂载时自动调）
            litNow: () => lockLitNow(),
            cache: { get: baseCacheGet, put: baseCachePut, clear: baseCacheClear, all: () => baseCacheAll(), key: BASE_CACHE_KEY },
            foot: () => renderFoot(),          // 只重画底栏（提示条 + 胶囊在这儿；探针改过 S.lock 之后用它刷新）
            bar: () => lockBarHtml(),          // 提示条那段 HTML（纯字符串，读起来比 DOM 稳）
        },
        // ★§BY-H：撤销记录怎么记（纯函数）—— 探针直接验"同一串拖动只保留最初那份 before"
        undoRecord: undoRecordFor,
        undoDrag: () => undoDrag(),              // ★B13d：撤销拖动（回到拖动前的初始位置）
        dragState: () => ({ ...S.drag, canUndo: !!S.dragUndo, override: Array.isArray(S.orderOverride) ? S.orderOverride.length : null }),
        // ★§22（2026-09-21）：来源块 / 位置待定 / 手动指定 / 拖动 —— 下一轮的浏览器验收与探针直接用这些口子
        src: {
            model: () => sourceBarModel(),
            bar: () => sourceBarHtml(),          // 页顶那块（纯字符串；浏览器里直接读它比读 DOM 稳）
            text: () => { const e = $el('#ywpu-summary .ywpu-srcbar') || $el('#ywpu-patch-body .ywpu-srcbar'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; },
        },
        anchor: {
            trouble: () => anchorTrouble(),      // {pending, low, unresolved, ratio, unfamiliar, lines}
            pending: () => pendingEntries(),     // 位置待定的新增条目（名字 + 结果里的 identifier）
            pendingIdents: () => [...pendingIdentSet()],
            orderIds: () => orderRowsNow().ids,  // 顺序页看到的那份顺序（= 写盘用的那份）
            orderForBuild: () => orderOverrideForBuild(),
            pick: (ident, target) => applyPosPick(ident, target),   // 手动指定"插在哪条后面"（'' = 最上面）
            patchPick: (key, name) => patchPickAnchor(key, name),   // 更新包路：改 op.place.after（内核按名字定位）
            pendingAddsOf, pinFirst, moveAfter, srcModel,           // 纯函数（探针也真编译同一段源码）
        },
        // v4.1：给"点击逻辑穷举矩阵"测试用的口子（e2e/run-updater-extras.js ⑨ 会直接调它们，
        //   把 起点状态 × 点击顺序 全跑一遍）——别删
        clickBlock: pickBlockSide,
        applyBlock: applyBlockEdit,
        expandForEdit,
        choiceOf,
        decideProgress,
        blockDecided,
        blockSideOf,
        decide: (key, act) => handleItemAction(key, act),
        render: () => renderResult(),
    };
    console.log('[预设更新器] v' + VERSION + ' 已挂到余温工具箱（对话补全预设对比/合并；不覆盖原预设）');
    registerUpdaterCloudPortal();
}

/** ★P7 跨模块桥（§15：商店点「到更新器里挑」必须落到更新器这一份实现上）：
 *  真正的实现在本文件（它拥有 P1 的逐条确认页 + 写入 + 备份）；
 *  商店那边只管调 window.__ywUpdaterCloud.openStore / openStorePseudo / openStoreBatch ——
 *  两边各自是**按需加载**的独立模块（发布隔离：谁缺了都不许连累对方），
 *  所以用 window 上一个显式口子对接，不许静态 import。
 *  ★P6「云端自动取回整份」已下线（2026-09-23 · 台账 §CY）：原先这里还给商店交 run / state 两个出口，
 *    那两个随功能一起删了；原实现逐字留档在 preset-updater-cloud.removed.js。 */
function registerUpdaterCloudPortal() {
    try {
        window.__ywUpdaterCloud = {
            version: VERSION, build: BUILD,
            // ★P7（§15）：商店点「到更新器里挑」调它 —— 商店只挑包 + 挑缝进哪一份，缝这个动作在**这里**做
            openStore: openStorePack,
            // ★M11（跨批契约）：商店上传预览点「进详细缝入界面（伪）」调它 —— 全按钮 inert、绝不写盘
            openStorePseudo,
            // ★F2（跨批契约）：商店「一键更新全部有更新的卡」调它 —— 只打开，让用户逐条挑
            openStoreBatch,
        };
    } catch (e) { console.warn('[预设更新器] 注册云端入口失败', e); }
}

/** 来源区（就在分页里，不用打开窗口）：三份预设，每份都能"选已安装的"或"选文件"
 *  ⚠ 下拉里只预选**已经真正载入**的那份（S[slot]）。以前预选用"上次记住的名字"，
 *    于是出现"下拉显示 V0811、状态却是空的" → 点开始对比被误报"先选你的预设"（真实 BUG）。 */
/** 名字像不像（用来把"最可能是新版"的那份排到前面）：版本号不同但主干同名 → 最像 */
function nameScore(a, b) {
    const ka = String(a).replace(/\d+/g, '#').toLowerCase();
    const kb = String(b).replace(/\d+/g, '#').toLowerCase();
    if (!ka || !kb) return 0;
    if (ka === kb) return 2;
    let same = 0;
    for (const ch of new Set(ka)) if (kb.includes(ch)) same++;
    return same / Math.max(1, new Set(ka).size);
}

function renderSource() {
    const names = listPresetNames();
    // ② 新版候选：跟①的名字最像的排前面（并给第一个标 ★）
    const nextSorted = (() => {
        const base = S.mineName || "";
        if (!base) return names.slice();
        return names.slice().sort((a, b) => nameScore(b, base) - nameScore(a, base));
    })();
    const opts = (sel, list2) => (list2 || names).map(n => `<option value="${esc(n)}" ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
    /* ★§BY-B（2026-09-23 · 作者第十七批）："'你的预设'下面已经选了，下面又显示一次'已选'" ——
       原来那一行 `已选：〈名字〉 · N 条` 里的**名字就是上面下拉里已经显示的那一个**（纯冗余，还白占一行）。
       现在：① 位置并进上面那一行（`.ywpu-src-pick` 右端对齐），三份预设各省一行；
             ② 只写**下拉里看不到的东西** —— 从文件读的（下拉永远是空的那个选项）写文件名，
                从下拉选的只写条数（名字不抄第二遍）。"还没选"照旧写清楚。 */
    const stateOf = (slot) => {
        const o = S[slot], nm = S[slot + 'Name'];
        if (!o) return '<span class="ywpu-none">还没选</span>';
        /* ★Wave K1 · 顺带修复：读出来的东西**不是一份能用的预设**（文件坏了/被外部改过）⇒
           这里给一句人话，**不再**让 `o.prompts.length` 抛出去把整块 UI 打崩（正常预设走不到这一支）。 */
        if (!usablePreset(o)) return '<span class="ywpu-none">这份读不出来（文件可能坏了）</span>';
        if (S[slot + 'From'] === 'file') {
            return '<span class="ywpu-ok">来自文件</span> ' + esc(nm || '（未命名）') + ' <span class="ywpu-dim">· ' + o.prompts.length + ' 条</span>';
        }
        /* ★Wave H₂ ②（plan §D.2⒝）：商店缝入这条路要**如实回显"来自商店"** —— 改前它落进下面那句
           "✓ 已载入"，而 `S.nextName` 已经变成伪名 `☁ 商店：《…》` ⇒ 槽位与窗口头两边说法不一致。 */
        if (S[slot + 'From'] === 'store') {
            return '<span class="ywpu-ok">☁ 来自商店</span> <span class="ywpu-dim">· ' + o.prompts.length + ' 条（这次缝入的新版）</span>';
        }
        return '<span class="ywpu-ok">✓ 已载入</span> <span class="ywpu-dim">· ' + o.prompts.length + ' 条</span>';
    };
    $el('#ywpu-sec-source').innerHTML = `
${(S.badPresets && S.badPresets.length) ? `<div class="ywpu-risk" id="ywpu-badpreset">⚠ 读不出「${esc(S.badPresets.join('、'))}」的内容（这份预设文件可能坏了、或被外部改过）—— 这次先跳过它，你可以在下面的下拉里另选一份。</div>` : ''}
<div class="ywpu-src" id="ywpu-src-mine">
    ${/* ★W58-a（作者 2026-09-27 反馈 · 第 1~4 条）：三槽位标题行的**括注全部删掉**（原来每份后面都跟着一个
        .ywpu-src-origin「（从已安装预设里选）」—— 三处一处不剩），② 那句「（可拖文件进来）」也不写了
       （拖放这个**功能**一个字没动，见 wireSource 里那条 drop 监听）。
       改成**必选 / 可选**两个小标（作者原话："你的预设/新版预设 后面各加小字（必选）、
       官方旧版 后加（可选）；★两种颜色必须不一样"）：色/字号**走既有档**（不新造平行样式、
       不硬编码 hex）—— 必选 = 强调色那一族的 ink（.ywpu-src-must），可选 = 那枚安静的次要文字色
       （.ywpu-src-opt）；两个类的新规则见 preset-updater.css 里 W58 那一段。
       ★③ 那行原来 .ywpu-sub 的开头就写着「可选 · 」—— 现在有了同名小标，那句前缀**必须去掉**
       （否则同一行出现两个「可选」= 重复）；sub 的其余文字一个字没改。
       ★本注释在模板字符串里：不许出现反引号、不许出现美元加大括号。 */''}
    <div class="ywpu-src-t"><span class="ywpu-src-no">①</span><b>你的预设</b><span class="ywpu-src-must">（必选）·</span><span class="ywpu-sub">你现在在用的那份</span></div>
    <div class="ywpu-row">
        <select class="ywpu-input" id="ywpu-mine-select" style="flex:1 1 200px">
            <option value="">（从已安装预设里选）</option>
            ${opts(S.mineFrom === 'preset' ? S.mineName : '')}
        </select>
        <button class="ywpu-btn ywpu-mini" id="ywpu-mine-file">选文件…</button>
        <input type="file" id="ywpu-mine-input" accept=".json,application/json" style="display:none">
        <span class="ywpu-src-pick" id="ywpu-mine-state">${stateOf('mine')}</span>
    </div>
    ${S.lastStitch && S.lastStitch.name ? `<div class="ywpu-stitchlog">✅ 上次缝入：<b>${esc(S.lastStitch.name)}</b> · ${S.lastStitch.backedUp && S.lastStitch.backupName ? `备份是 <b>${esc(S.lastStitch.backupName)}</b>（想退回原样就在上面的下拉里选它）` : '<b>没有备份</b>（那次没勾「同时自动备份」，是直接改的）'}</div>` : ''}
</div>

<div class="ywpu-src" id="ywpu-src-next">
    ${/* ★W94（F3 修 A · "对比完全不对"那次误读的直接诱因）：这句静态副标题原本写死「作者刚发的那份」——
       它在**更新器自己那条路**上是对的（② 是你自选的整份），可商店"缝入"这条路上 ② 是**临时拼出来的**
       （= 你这份 + 这张卡的改动，纯内存、不落盘）⇒ 照旧写会把作者引到"我的 vs 官方"的误读上
       （他实测：一张只改 3 处的卡，其余条目按定义两边一样，于是首页 144 行"两边一样"）。
       ⇒ 按 `S.nextFrom`（`'store'` = 商店那几条路：单张缝入 / 伪缝入 / 一键批量 / 重新缝）换成人话；
         非商店路（更新器自己选 ①②）**逐字不变**。 */''}
    <div class="ywpu-src-t"><span class="ywpu-src-no">②</span><b>新版预设</b><span class="ywpu-src-must">（必选）·</span><span class="ywpu-sub">${S.nextFrom === 'store' ? '你这份 ＋ 这张卡的改动' : '作者刚发的那份'}</span></div>
    <div class="ywpu-row">
        <select class="ywpu-input" id="ywpu-next-select" style="flex:1 1 200px">
            <option value="">（从已安装预设里选）</option>
            ${/* ★Wave H₂ ②（plan §D.2⒝）：商店缝入那份是**临时新版**（不落盘、不进已安装清单）⇒
                 槽位下拉里补一条 selected 的伪项把它**显出来**。`value=""` ⇒ change 分支自然忽略，
                 绝不会被当成预设名去 readPreset。 */''}
            ${S.nextFrom === 'store' ? `<option value="" selected>${esc(S.nextName || '☁ 商店')}（这次从商店缝入的新版）</option>` : ''}
            ${opts(S.nextFrom === 'preset' ? S.nextName : '', nextSorted)}
        </select>
        <button class="ywpu-btn ywpu-mini" id="ywpu-next-file">选文件…</button>
        <input type="file" id="ywpu-next-input" accept=".json,application/json" style="display:none">
        <span class="ywpu-src-pick" id="ywpu-next-state">${stateOf('next')}</span>
    </div>
</div>

<div class="ywpu-src" id="ywpu-src-base">
    ${/* ★Wave W8（2026-09-24 · 作者第 21 批 §FE-C2/C4）：③ 这一句**只讲它真正管的事**。
        作者原话问的是"不填官方旧版，缝入时也能找到前后邻居吧？填它对找位置有没有影响"——
        实测（`e2e/tmp/w8-c2-kernel.js`：同一份 ① 填/不填 ③ 各跑一遍内核）：
          · 条目清单/顺序**逐位相同**、`buildMerged` 落盘 `prompt_order` 在三种决策下**逐格相同**；
          · 正则的「位置待定」条数 1 vs 1、每条 place/afterId/conf **完全一致**；
          · 变的**只有「谁改的」**（15 条从"两边不同"变成"作者改过/只有你改过" + 三方对比 false→true）。
        ⇒ 所以这里把"位置"这件事**明确写出来**（一句否决），比让用户自己猜好：
          「只帮你看清"这条是谁改的"（不影响缝在哪）」—— 字数 25 < 原来的 30（不占更多宽度、不动首屏）。
        ★作者拟改的那句（「选了它，缝入时更容易按"你预设里的前后邻居"自动找到正确位置；」）**属于上传页**
          （`preset-store.js` 的 baseHintHtml，那边 ③ 真的是包里锚点的坐标系，见 §FE-A10 ⇒ 归 W6）：
          它放在**对比页**会把因果说反（这一页的 ③ 与位置无关）。
        ★W7 的只读探针（26/26）+ 本文件 `tmp/w8-c2-kernel.js` 两路读数一致 ⇒ 对比页这里**逐字照抄
          W7 给的那句人话**（放在 ③ 下面那条 `.ywpu-note` 里，正文可见、不靠 hover；inline 那句
          `.ywpu-sub` 放不下整句 —— 它是 ③ 标题行里的一小段，太长会把标题行撑成两行）。 */''}
    <div class="ywpu-src-t"><span class="ywpu-src-no">③</span><b>官方旧版</b><span class="ywpu-src-opt">（可选）</span><span class="ywpu-sub">只帮你看清"这条是谁改的"（不影响缝在哪）</span></div>
    <div class="ywpu-row">
        <select class="ywpu-input" id="ywpu-base-select" style="flex:1 1 200px" title="选一份官方旧版当基准：选完当场重算（不填也行：下面照样逐条挑）">
            <option value="">（不用基准：只能看出两边不同，判断不了是谁改的）</option>
            ${opts(S.baseFrom === 'preset' ? S.baseName : '')}
        </select>
        <button class="ywpu-btn ywpu-mini" id="ywpu-base-file">选文件…</button>
        <input type="file" id="ywpu-base-input" accept=".json,application/json" style="display:none">
        <span class="ywpu-src-pick" id="ywpu-base-state">${stateOf('base')}</span>
    </div>
    <div class="ywpu-note">你选不选基准，都不影响它插在哪儿 —— 位置是上传的人传的时候定好的；你选的基准只决定"每一步能不能看出是作者改的还是你改的"。</div>
    <div class="ywpu-note">例：假如你以 V0824 为基础进行自改、作者发了 V0923 → ③ 选 V0824 的原版。</div>
</div>`;
    wireSource();
}

/** 启动时把"上次用过的那几份预设"真正载入进来（而不是只在下拉里显示个名字） */
function restoreSaved() {
    const st = getSettings();
    const names = listPresetNames();
    const loaded = [];
    /* ★Wave K1 · 顺带修复：把"读不出内容的那几份"记下来，给界面一句人话（见 renderSource 里那句 .ywpu-risk） */
    S.badPresets = [];
    // ★首页引导：没选过就自动选上"你现在正在用的那份"（用户视角：①就是我在用的）
    if (!st.lastMineName) {
        try {
            const pm = presetManager();
            const cur = pm && typeof pm.getSelectedPresetName === 'function' ? pm.getSelectedPresetName() : '';
            if (cur && names.includes(cur)) {
                st.lastMineName = cur;
                console.log('[预设更新器] 自动把①设成你现在正在用的预设：' + cur);
            }
        } catch (e) { /* 拿不到就算了 */ }
    }
    for (const slot of ['mine', 'next', 'base']) {
        const key = 'last' + slot[0].toUpperCase() + slot.slice(1) + 'Name';
        const want = st[key];
        if (!want) continue;
        if (!names.includes(want)) {
            /* ★Wave E2（项4b · plan §3.2③ 第 6 步 / §10.2 Q4）：手选的"云端那一版"（如 `V0824`）
               **不是本机预设名** ⇒ 从**永久缓存**（`yw_pu_base_pack`）里恢复：0 网络、**不重下整份**
               （缓存里就是官方那一版的同一份内容，一版一卡、永不原地改 ⇒ 永远有效）。
               ★老行为一个字不变：缓存里没有 ⇒ 照旧忘掉（该重选就重选，绝不拿别的版本顶替）。 */
            if (slot === 'base') {
                const hit = baseCacheGet(lockKey(want));
                if (hit) {
                    S.base = hit; S.baseName = want; S.baseFrom = 'cloud';
                    lockNet.cacheHit++;
                    loaded.push('③：' + want + '（从本机缓存恢复，不用重下）');
                    continue;
                }
            }
            st[key] = ''; continue;   // 预设被删/改名 → 忘掉
        }
        try {
            const obj = readPreset(want);
            /* ★Wave K1 · 顺带修复：**读出来的不是一份能用的预设**（文件坏了/被外部改坏）⇒
               跟"这份预设被删了"走**同一条既有分支**（`st[key]=''` = 忘掉它、界面上就是"还没选"），
               额外把名字记进 `S.badPresets` ⇒ 界面给一句人话 + toast（**不许静默、也不许只有 console**）。
               ★正常预设恒走原路（`usablePreset` 恒 true）⇒ 与改动前逐字节同表现。 */
            if (!usablePreset(obj)) { S.badPresets.push(want); st[key] = ''; continue; }
            S[slot] = obj; S[slot + 'Name'] = want; S[slot + 'From'] = 'preset';
            loaded.push(slotLabel(slot) + '：' + want);
        } catch (e) { st[key] = ''; }
    }
    saveSettings();
    /* ★Wave B2（plan §3.2③ 第 6 步 / §6.3 ④）：① 换人了 ⇒ 上次那笔手选基准**自动作废**
       —— "用了跟当前 ① 无关的旧基准"是"假归属"的第二大来源（仅次于版本认错）。 */
    if (S.base && !basePickStillValid()) {
        S.base = null; S.baseName = ''; S.baseFrom = '';
        dropStaleBasePick();
    }
    if (loaded.length) console.log('[预设更新器] 已恢复上次选择 → ' + loaded.join('；'));
}

function wireSource() {
    const s = getSettings();
    const bindSelect = (slot, sel) => {
        $el(sel)?.addEventListener('change', function () {
            const name = this.value;
            if (!name) return;
            try {
                const obj = readPreset(name);
                S[slot] = obj; S[slot + 'Name'] = name; S[slot + 'From'] = 'preset';
                s['last' + slot[0].toUpperCase() + slot.slice(1) + 'Name'] = name; saveSettings();
                invalidate(); renderSource();
                toast('success', slotLabel(slot) + '：' + name + '（' + obj.prompts.length + ' 条）');
                if (slot === 'mine') { const nx = $el('#ywpu-next-select'); if (nx && !S.next) toast('info', '② 新版预设：下拉里最上面那个最像新版'); }
            } catch (e) { toast('error', e.message); }
        });
    };
    bindSelect('mine', '#ywpu-mine-select');
    bindSelect('next', '#ywpu-next-select');
    $el('#ywpu-base-select')?.addEventListener('change', function () {
        const name = this.value;
        if (!name) { S.base = null; S.baseName = ''; S.baseFrom = ''; s.lastBaseName = ''; s.lastBaseFor = ''; saveSettings(); invalidate(); renderSource(); return; }
        try {
            const obj = readPreset(name);
            S.base = obj; S.baseName = name; S.baseFrom = 'preset';
            /* ★Wave B2：面板里手选的 ③ 也要记"这手选是给哪份 ① 选的"（跟结果窗口那个手选同一个口径）
               —— 否则"换了 ① 之后旧基准还在"这条就防不住（plan §6.3 ④ 的假归属第二大来源）。 */
            s.lastBaseName = name; s.lastBaseFor = mineFpDigest(); saveSettings();
            invalidate(); renderSource();
            toast('success', '官方旧版：' + name);
        } catch (e) { toast('error', e.message); }
    });
    const bindFile = (slot, btn, input) => {
        $el(btn)?.addEventListener('click', () => $el(input).click());
        $el(input)?.addEventListener('change', async function () {
            const f = this.files?.[0]; this.value = '';
            if (!f) return;
            try { acceptPreset(parseJsonLoose(await f.text()), slot, f.name.replace(/\.json$/i, ''), 'file'); }
            catch (e) { toast('error', '读文件失败：' + e.message); }
        });
    };
    bindFile('mine', '#ywpu-mine-file', '#ywpu-mine-input');
    bindFile('next', '#ywpu-next-file', '#ywpu-next-input');
    bindFile('base', '#ywpu-base-file', '#ywpu-base-input');

    // 拖文件到「新版预设」那一行
    const row = $el('#ywpu-src-next');
    if (row) {
        ['dragenter', 'dragover'].forEach(ev => row.addEventListener(ev, (e) => { e.preventDefault(); row.classList.add('ywpu-hover'); }));
        ['dragleave', 'drop'].forEach(ev => row.addEventListener(ev, () => row.classList.remove('ywpu-hover')));
        row.addEventListener('drop', async (e) => {
            e.preventDefault();
            const f = e.dataTransfer?.files?.[0];
            if (!f) return;
            try { acceptPreset(parseJsonLoose(await f.text()), 'next', f.name.replace(/\.json$/i, ''), 'file'); }
            catch (err) { toast('error', '读文件失败：' + err.message); }
        });
    }
}

/** 源变了 → 旧结果作废 */
function invalidate() {
    S.analysis = null; S.decisions = {}; S.params = {}; S.expanded = {}; S.unpair = []; S.posMap = null;
    S.lock = null; S.lockDeclared = ''; S.lockBusy = ''; S.lockPending = false;   // ★Wave B2/E2：源变了 ⇒ 三状态判定也作废（别留旧读数）
    /* ★W17C-2：源一变 ⇒ `S.decisions` 清空（上面那行）⇒ 那两颗"一键"的高亮自然灭
       （高亮现在是 `bulkSideModeOf(an.items, S.decisions)` 现算的，**不用**再手动复位哪个状态位）。 */
    renderResult();
}

function acceptPreset(obj, slot, name, from = 'file') {
    if (!PM.isValidPreset(obj)) {
        toast('error', '这不像一份对话补全预设（缺 prompts / prompt_order）。请确认导出的是「对话补全」类型的预设。');
        return false;
    }
    S[slot] = obj; S[slot + 'Name'] = name || ''; S[slot + 'From'] = from;
    invalidate(); renderSource();
    toast('success', slotLabel(slot) + '已载入：' + (name || '（未命名）') + '（' + obj.prompts.length + ' 条）');
    return true;
}

/** ★W19A ①：把某个槽位按**盘上现在那份**重读一遍（只在"来自已安装预设"时才做）。
 *  与 `acceptPreset()` 的分工：那个是"**换人了**"（有 toast、清结果、重画源区）；这个是"**同一份、内容变了**"
 *  —— 每次开对比前静默对齐，由调用方决定怎么提示（真变了才提示，没变一个字都不说）。
 *  ★为什么不能只比名字：名字一样、内容早改过了 —— 这正是作者报的那件事。
 *  @param {'mine'|'next'|'base'} slot
 *  @returns {{ok:boolean, changed:boolean, name:string, from:string, why:string, before?:string, after?:string}} */
function rereadSlot(slot) {
    const out = { ok: false, changed: false, name: String(S[slot + 'Name'] || ''), from: String(S[slot + 'From'] || ''), why: '' };
    if (out.from !== 'preset') { out.why = '不是已安装预设（文件/商店来的，盘上没有这一份）'; return out; }
    if (!out.name) { out.why = '没名字'; return out; }
    let names = [];
    try { names = listPresetNames(); } catch (e) { names = []; }
    if (!names.includes(out.name)) { out.why = '酒馆里没有这份了（删了/改名了）'; return out; }
    let fresh = null;
    try { fresh = readPreset(out.name); } catch (e) { out.why = '读不出来：' + ((e && e.message) || e); return out; }
    if (!usablePreset(fresh)) { out.why = '读出来的不是一份能用的预设（没有 prompts）'; return out; }
    out.ok = true;
    out.before = presetDigestOf(S[slot]);
    out.after = presetDigestOf(fresh);
    if (slotNeedsReread(out.before, out.after)) {
        S[slot] = fresh;
        out.changed = true;
    }
    return out;
}

/** ★W19A ①：**写盘前**拦一道"① 那份预设刚在别处被改过"—— 不许拿旧快照去覆盖/另存。
 *  为什么写盘口也要拦（同一族的第二处伤）：`生成新预设` / `缝入当前预设` 都是拿 `S.mine` + **那一轮的分析结果**
 *  拼出来的；如果用户中途改了 ①，而我们还按旧快照拼 ⇒ 他刚改的那些**会被悄悄吃掉**
 *  （缝入是**覆盖原文件**，吃掉就找不回来了）。口径：**先不动盘**，把对比按最新内容重算一遍，
 *  让用户看一眼有没有要重新挑的，再点一次。
 *  @returns {boolean} true = 拦下了（调用方必须直接 return，不许写盘） */
function mineChangedSinceAnalysis() {
    if (!S.analysis || S.mineFrom !== 'preset') return false;      // 没在对比 / ① 不是盘上那份 ⇒ 没这条风险
    const r = rereadSlot('mine');
    if (!(r.ok && r.changed)) return false;
    S.analysis = null; S.decisions = {}; S.blocks = {}; S.posMap = null;   // 源变了 ⇒ 旧结果作废
    renderSource();
    try { runAnalyze(); } catch (e) { console.warn('[预设更新器] 重读 ① 之后重算失败', e); }
    toast('warning', '①「' + S.mineName + '」你刚在酒馆里改过 —— 已经按**最新内容**重算了一遍对比；'
        + '看一眼有没有要重新挑的，再点一次这个按钮。', { timeOut: 12000 });
    console.info('[预设更新器] 写盘前发现 ① 被改过 ⇒ 不写盘，先重算', { 名字: S.mineName, 条目数: (S.mine && S.mine.prompts || []).length, 摘要: presetDigestTag(S.mine) });
    return true;
}

// ================================================================ 二、结果窗口

function buildWindow() {
    if ($el('#ywpu-root')) return;
    const root = document.createElement('div');
    root.id = 'ywpu-root';
    root.innerHTML = `
<div id="ywpu-panel">
    <div id="ywpu-head">
        <!-- ★W19A ③（作者第 24 批："右上角那颗 ✕ 要真的在右上角；电脑版现在跑到'条目商店'下面去了，
             怀疑是左边'标题'和'缝进什么'把它挤的" ⇒ "把标题与'缝进…'拆成两行（标题第一行、'缝进'第二行）"）：
             这一块从"一行 flex + 自动换行"改成**两行**：
               · 第 1 行（#ywpu-head-top）：标题 ……（右边恒定 ✕）；
               · 第 2 行（#ywpu-head-row）：「缝进什么」（副标题）+ 三个分页；
             ✕ 与分页**不再同处一个可换行的 flex 盒子** ⇒ 它永远不会被分页挤到第二行去。
             改前实测（宽屏被挤时）：#ywpu-close 的 y 落在分页那一行、x 在「🛒 条目商店」左下方。 -->
        <div id="ywpu-head-top">
            <div class="ywpu-title">🔄 对比结果</div>
            <!-- ★W106 ②（作者原话："商店里 右上角的条目状态 点开来后 鼠标要移到左上角才能重新折叠起来。
                 这个条目状态放进最左边对比结果旁边；点击后它的折叠区域还在原地；再点击一次就收起"）：
                 图例（含 4 颗状态色点）从"面板右上角"搬进头部第 1 行、紧挨标题（DOM 一起搬家，见 legendHtml()）。
                 老位置是"绝对定位钉右缘"：一展开整盒向左长 ⇒ 那颗 summary 会**跳到展开区左上角**，
                 收起得把鼠标移回去；现在它随行排版、展开层挂在本组件正下方（浮层，见 CSS）。 -->
            ${legendHtml()}
            <button id="ywpu-close" title="关闭">✕</button>
        </div>
        <div id="ywpu-head-row">
            <div id="ywpu-head-sub" class="ywpu-sub"></div>
            <!-- ★W106 ③（作者原话："最上面的条目商店左边怎么有个 展开 这个完全没用啊？什么意思？历史遗留？删掉"）：
                 那颗独立按钮**删掉**了 —— "看全标题"并进这一行本身（点 #ywpu-head-sub = 展开/收起，
                 绑定见 buildWindow 尾部）；全标题画在下面这个**浮层**里（不推挤、不位移，再点一次收起）。
                 ★它不在 sub 里面 ⇒ sub 的 textContent 一个字符没多（store 套件的按字断言照旧过）。 -->
            <div id="ywpu-head-full" class="ywpu-subfull" hidden></div>
            <div class="ywpu-flex ywpu-tabs">
                <button class="ywpu-btn ywpu-mini" id="ywpu-tab-store">🛒 条目商店</button>
                <button class="ywpu-btn ywpu-mini" id="ywpu-tab-items">✍ 条目详细编辑</button>
                <button class="ywpu-btn ywpu-mini" id="ywpu-tab-order">📋 新预设总览</button>
            </div>
        </div>
        <div id="ywpu-storebatch" class="ywpu-storebatch"></div>
    </div>
    <div id="ywpu-body">
        <div id="ywpu-view-order" style="display:none"></div>
        <div id="ywpu-view-store" style="display:none"></div>
        <div id="ywpu-view-items">
            <div id="ywpu-summary"></div>
            <div id="ywpu-toolbar"></div>
            <div id="ywpu-list"></div>
            <div id="ywpu-params"></div>
        </div>
    </div>
    <div id="ywpu-foot"></div>
</div>`;
    document.body.appendChild(root);
    // ★关法只有 ✕（作者："所有弹出的界面都必须手点 ✕ 才关"）：
    //   · 点空白不关（老注释：用户"总点到别的地方就自动退出整个对比页面"）；
    //   · Esc 不关（原来这里有一条 document 级 keydown → 已删，见 §23）；
    //   · 还要挡住 ST 那层"点浮层里任何地方就把扩展抽屉收走"（跟商店同一套，见 guardOverlay）。
    guardOverlay(root);
    $el('#ywpu-close').addEventListener('click', () => closeWindow());
    /* ★W106 ③：「☁ 来自商店…」那行本身就是开关（非商店路点了没反应）——点它 = 展开/收起全标题浮层。 */
    $el('#ywpu-head-sub')?.addEventListener('click', () => { if (!S.store) return; S.headOpen = !S.headOpen; renderHead(); });
    /* ★W106 ②：图例（搬家后常驻窗口头）——色块改色 +「恢复默认颜色」的绑定搬到这里（只绑这一次；
       以前这两段在 renderResult 里、每次重画 summary 都会重绑一遍）。 */
    $el('#ywpu-head-top').querySelectorAll('input[data-color]').forEach(inp => inp.addEventListener('input', function () {
        const k = this.getAttribute('data-color');
        const st = getSettings(); st.colors = { ...(st.colors || {}), [k]: this.value }; saveSettings();
        applyColors();
    }));
    $el('#ywpu-head-top').querySelector('#ywpu-colors-reset')?.addEventListener('click', () => {
        const st = getSettings(); st.colors = {}; saveSettings(); applyColors(); syncLegendInputs(); renderResult();
        toast('info', '颜色已恢复默认');
    });
    // ★F2：「一起挑」进度条的按钮（容器是静态的，按钮每次重画 → 事件委托，绑一次）
    const batchBar = $el('#ywpu-storebatch');
    if (batchBar) batchBar.onclick = (ev) => {
        const b = ev.target.closest && ev.target.closest('[data-batch-go]');
        if (!b) return;
        ev.preventDefault();
        const go = b.getAttribute('data-batch-go');
        if (go === 'exit') { S.storeBatch = null; renderHead(); toast('info', '好，退出「一起挑」—— 现在只对付手上这一张'); return; }
        if (go === 'prev') { openStoreItemAt((S.storeBatch ? S.storeBatch.i : 0) - 1); return; }
        if (go === 'next') { openStoreItemAt((S.storeBatch ? S.storeBatch.i : 0) + 1); return; }
    };
    $el('#ywpu-tab-items').addEventListener('click', () => { S.view = 'items'; renderView(); });
    $el('#ywpu-tab-order').addEventListener('click', () => { S.view = 'order'; renderView(); });
    // ★第二入口：第三个标签 = 云端「条目商店」（同一个模块挂到 #ywpu-view-store 上；模块没加载就什么都不做）
    $el('#ywpu-tab-store').addEventListener('click', () => { S.view = 'store'; renderView(); });
}

function openWindow() { buildWindow(); $el('#ywpu-root').classList.add('ywpu-open'); renderAll(); }
function closeWindow() {
    const r = $el('#ywpu-root'); if (r) r.classList.remove('ywpu-open');
    // ★M11 / ★F2：关窗 = 这次会话真的结束了 —— 预览开关与批量队列都归零（下次点卡片不会带着上一次的残留）
    S.preview = false;
    S.storeBatch = null;
    S.dragUndo = null;
    /* ★W17C-2：关窗 = 这次会话真的结束了 —— 那两颗"一键"的高亮不用再手动复位（现算；`S.decisions`
       在下次 `runAnalyze` 时重建）。 */
    S.drag = { on: false, ident: '', slot: 0 };
}

function startCompare() {
    /* 防御：状态里没载入、但下拉里选着名字 → 先按名字载入（杜绝"看着选了却说没选"）
       ★Wave H₂ ②（plan §D.2⒞ · 真修的那一处）：**界面值为准** ——
         改前第一句是 `if (S[slot]) return true;`，而商店那条路已经把 `S.next` 换成了商店缝入的那份
         ⇒ 点「开始对比」直接早退，**完全无视下拉里现在写着什么**，继续算"刚才那次正则缝入"的对比，
         用户看到的却是普通两方对比 —— 这正是作者原话那件事。
         现在：槽位若是"商店缝入的临时新版"（`From === 'store'`），**先清掉、再照下拉里那份载入**；
         下拉里没有真预设（商店那条伪项 `value=""`，见 `renderSource()`）⇒ **拒绝换人**（见下面那条守卫），
         保持原样 —— 槽位 / 窗口头 / 窗口内容三者仍然一致（都是那次商店缝入）。
         `S.mineFrom` 不用清（商店那条路 `cloudPickMine` 已经把它设成 'preset' 且指向"缝进哪一份"，
         ① 与窗口内容本来就一致）。 */
    let cleared = false;
    /* ★W19A ①：这一轮"内容跟快照不一样、已经重读过"的槽位（下面统一提示一次，别在循环里连喷） */
    const stale = [];
    const fix = (slot, sel) => {
        const v = $el(sel)?.value;
        if (S[slot + 'From'] === 'store') {
            /* ★**下拉里没有真预设**（写着的就是那条"☁ 商店：《…》（这次从商店缝入的新版）"，`value=""`）⇒
               **界面的意思就是"② = 商店缝入的那份"** ⇒ 保持这次商店会话、照它重算一遍（照旧早退）。
               这条别改成"拒绝"：`r9h-updater-ui.js` 的 M24 就是"商店包（两方）→ 用户手填 ③ → 再点开始对比，
               要的是**这次商店包的三方对比**"，拒绝掉会把那条真断言弄红（实测踩过 1 次）。 */
            if (!v) return true;
            S[slot] = null; S[slot + 'Name'] = ''; S[slot + 'From'] = ''; cleared = true;
        }
        /* ★W19A ①（作者第 24 批 ① 的真现场之一）：**同一份预设，内容可能已经变了**。
           改前这里就是 `if (S[slot]) return true;` —— 槽位里那份快照是"上次开对比时读的"，
           用户回酒馆把"我现在在用的这份"改了（改一条正文 / 加一条），再点「开始对比」直接早退
           ⇒ 算的还是旧快照，对比里自然看不到他刚改的地方（原话："完全没有能够对比出我刚才有自行修改的那个地方"）。
           现在：每次开对比**前**按①下拉里现在选的那份（= 盘上现在那份）重读一遍；内容真变了就换掉并如实提示。
           ★判据是**内容摘要**（内核指纹），不是名字、不是时间戳 ⇒ 名字一样、内容一样 ⇒ 一个字节都不动。 */
        if (S[slot]) {
            const r = rereadSlot(slot);
            if (r.ok && r.changed) stale.push(slot);
            return true;
        }
        if (!v) return false;
        try { S[slot] = readPreset(v); S[slot + 'Name'] = v; S[slot + 'From'] = 'preset'; return true; }
        catch (e) { return false; }
    };
    fix('mine', '#ywpu-mine-select');
    fix('next', '#ywpu-next-select');
    if (cleared) renderSource();     // 槽位立刻回到"还没选"（别留着上一轮那行"来自商店"）
    if (stale.length) {
        /* 只在这种"用户改过、我们按新的重算"的情况下说一句（正常开对比一个字多余的话都不加）。
           提示里带读数（摘要前 8 位 + 条目数），出问题能对着 console 复现。 */
        const who = stale.map(s => slotLabel(s) + '「' + String(S[s + 'Name'] || '') + '」').join('、');
        toast('info', who + '你刚在酒馆里改过 ⇒ 已经按**最新内容**重新算了一遍对比');
        console.info('[预设更新器] 开对比前重读了槽位（内容跟手上的快照不一样）',
            stale.map(s => ({ 槽位: slotLabel(s), 名字: S[s + 'Name'], 条目数: (S[s] && S[s].prompts || []).length, 摘要: presetDigestTag(S[s]) })));
    }
    /* ★Wave H₂ ②（同一族残留）：`S.regexBase` 是**商店那条路**专用的正则三方基准（只有 openStorePack 设它）。
       不清的话，商店会话之后再来一次手动对比，正则那一层会拿着**上一张卡**的基准去归因（假归属）。
       手点「开始对比」= 一次全新的手动会话（跟上面 `S.store` / `S.orderOverride` 同一个口径）。 */
    S.regexBase = null;
    if (!S.mine) { toast('warning', '先选「① 你的预设」'); return; }
    if (!S.next) { toast('warning', '先选「② 新版预设」'); return; }
    S.store = null;      // ★P7：手动「开始对比」= 一次新的对比会话（别把"来自商店"那套和"绝不覆盖同名"带进来）
    /* ★P2-6（audit-p12 · 真 BUG）：**手选顺序跨会话泄漏** —— 上一轮在「新预设总览」里拖过、或用手选下拉指定过位置
       （= `S.orderOverride`，实测是 155 个 id 的一份顺序），关掉窗口后再点手动「开始对比」，新会话仍然套着它：
       页面上凭空冒出「恢复自动顺序」按钮、写盘也会按那份**旧**顺序落，用户完全不知道为什么。
       `openStorePack()` 早就这么清了（见那边的 `S.orderOverride = null`），手动这条路漏了 —— 现在两边一致：
       **开一次新对比 = 顺序重来**（原来那句老行为"零回归面"一个字没变，只是不再带着上一轮的残留）。 */
    S.orderOverride = null;
    S.storeBatch = null;      // ★F2：手动「开始对比」= 退出"一起挑"（别把上一次商店带过来的一批卡挂着）
    S.preview = false;        // ★M11：手动这条路永远不是预览
    S.dragUndo = null;
    /* ★Wave B2（plan §3.1④）：手动路的"声明基准" = **用户自己手选的 ③**（没有 = 没声明 ⇒ 状态③ + 手选）。
       ★**不自动填 ③**（plan §9.2 风险 8 写明：自动填会把 3 套按"两方"造的夹具冲成三方）——
         自动认出来的只当**建议**（手选下拉里预选好 + 一颗 ［V0824］），用不用由用户自己点。
       ★异步那一趟（云端清单）也在这儿挂上：拿到更全的候选就地重算 + 就地重绘（保留滚动）。 */
    if (S.lockBusy) { toast('info', '正在核对基准，稍等一下'); return; }
    /* ★① 换人了 ⇒ 上次那笔手选基准自动作废（连 S.base 一起清 —— 面板里换 ① 之后 ③ 还挂着旧的那份，
       三方对比就会拿一个跟当前 ① 无关的基准去归因 = 假归属；plan §3.2③ 第 6 步 / §6.3 ④） */
    if (S.base && !basePickStillValid()) { S.base = null; S.baseName = ''; S.baseFrom = ''; renderSource(); }
    dropStaleBasePick();
    S.lock = null;
    lockRun({ declaredVer: (S.base && S.baseName) ? lockKey(S.baseName) : '', who: '你选的基准', cloud: true });
    openWindow();
    runAnalyze();
}

function runAnalyze(preserve = false) {
    const keep = preserve ? { ...S.decisions } : null;
    const keepRx = preserve ? { ...S.regexDecisions } : null;
    try {
        const an = PM.analyze({ mine: S.mine, next: S.next, base: S.base || undefined, unpairKeys: S.unpair });
        S.analysis = an;
        S.posMap = null;
        /* ★W94（F3 修 C · 真缺陷）：「隐藏条目」（不在顺序表里 ⇒ 对比列表看不到）被这次对比**改了/丢了/加了**时，
           把名字点出来（内核那句「有 N 条…没列进来」只数个数，不说是哪几条、更不说有没有被动过）。
           纯展示用的读数，**不参与决策、不参与落盘**。判据与内核 `hiddenSkipped` 同一个（都用 `PM.matchPresets` +
           `PM.isHiddenEntry`）—— 见 `hiddenTouchedOf` 自己的注释。失败绝不拖垮对比（内部兜底成空表）。 */
        /* ★W99-己：`S.hiddenNote = hiddenTouchedOf(...)` 不再算（谁都不读它了 —— 那段提示整块删掉）。 */
        S.decisions = {};
        // **不替用户做选择**：需要处理的条目一律留空（source=null），顶部显示"还剩几条要处理"
        for (const it of an.items) {
            const kept = keep && keep[it.key];
            if (kept && kept.source) S.decisions[it.key] = kept;
            else if (!PM.needsChoice(it)) S.decisions[it.key] = PM.fallbackDecision(it);
            else S.decisions[it.key] = { source: null };
        }
        // ★R8：预设级正则（`extensions.regex_scripts`）——同一套"不替用户做选择"的规矩：
        //   内核已经把"危险的不默认缝 / 你独有的不默认删 / 不一样的默认保你的"定好了（见 mergeRegexes）。
        analyzeRegexesIntoState(keepRx);
        /* ★Wave G ①（2026-09-23 夜间 · 作者实测："前面一大片没改动的、要拖到很下面才看得到正则"）：
           这个包**一条条目都不用你选**（needDecide = 0）却改了正则 → 正则块**默认就展开**，
           配合 `renderList()` 的"条目区收成一句话"，正则块直接从第 8 屏提到首屏。
           只在"0 条要选 && 有正则"这一种场景生效 ⇒ 普通更新包（needDecide ≥ 1）一个字不变。 */
        /* ★W107-②：`S.regexOpen = true` 改成 `S.scopeRx = true`（同一个意图：这个包一条条目都不用选、
           却改了正则 ⇒ 让正则行**当场就在下面**；外框统一后"显示"就是"出行"，不再需要二次展开）。
           ★★W111-③：这条赋值**搬到 `defaultScopeOf()` 之后**了（见下面那段新注释）——
             当年它就被紧跟着的那行赋值盖掉（"顺序写反"），所以这里不再放任何赋值。 */
        if (!preserve) {
            S.params = {};
            for (const p of an.params) S.params[p.key] = 'next';
        }
        S.orderMode = getSettings().orderMode || 'next';
        if (!preserve) {
            /* ★W94（F3 修 B · 那张卡的 3 处改动按预设位置排在第 39/115/142 行 ⇒ 首屏完全看不到）：
               商店"缝入"这条路**开完对比就把条目区停在「待我处理」那一档**（与下面正则块的
               `S.regexFilter = 'pending'` 同一个默认口径）⇒ 一进来看到的就是要你挑的那几条，
               而不是 144 行「两边一样」把 3 行真差异埋起来。切「全部」照旧能看到全量。
               · **只管商店这条路**（`S.nextFrom === 'store'`）；更新器自己那条路（①②自己选）默认档
                 **一个字不变**（还是「全部」）—— 这是派单点名的边界。
               · 一个包**条目一条都不用你选**（只改全局参数那种）⇒ 不切 pending（否则列表空成
                 "没有匹配的条目"、而 0 计数的 chip 本来就不画 —— 界面会自相矛盾）；那种包维持「全部」。 */
            S.expanded = {};
            /* ★★W111-①（作者原话："我点击一个正则的卡片缝入 里面不是默认点击了待我处理……
               ……你去和预设条目一起统一"）：这颗默认档的判据原来**只数条目** ⇒ 正则包（条目一条都不用选）
               永远落「全部」，要处理的那几行埋在几十行里（实测：8 行埋在第 11/23/24/25/50~53 位）。
               现在两摊一起算（与 scopeNeedCount / itemsCollapsed 那两处同一个"两摊"口径）：
               正则侧"要你选"的判据 = 内核 `regexNeedsChoice`（与 `regexStats.needDecide` 同源，不新造一套）。
               ★W94 的边界一个字不动：两边都没有"要你选"的（只改全局参数那种）⇒ 仍维持「全部」。 */
            const needChoiceRx = (S.regexItems || []).some(it => PM.regexNeedsChoice(it));
            S.filter = (S.nextFrom === 'store' && (an.items.some(it => PM.needsChoice(it)) || needChoiceRx)) ? 'pending' : 'all';
            S.view = 'items'; S.keepVisible = {};
            /* ★W17C-2：那两颗"一键"的高亮不用在这条路上复位 —— 它是 `bulkSideModeOf()` 现算的，
               而下面 `an.items` 那一轮会把需要拍板的条目重新写成 `{source:null}` ⇒ 自然不亮。 */
            /* ★Wave G：开一次新对比 = 这几样也重来（跟 `S.orderOverride` 同一个口径：别把上一轮的残留带进来）
               ★Wave H₂ ①：`regexFilter` 也归位到作者要的默认态
               ★Wave W2 ①：默认态 = `'pending'`（「待我处理」那颗亮着 = 只看需要更改的）；一键的高亮一起灭
               ★W17C：`regexTouched = {}` 就是"一键的高亮一起灭"（高亮现算，判据里含这份名单） */
            S.itemsShown = false; S.regexPlace = {}; S.regexPlaceOpts = []; S.regexTouched = {}; S.regexSameOpen = false;
            S.regexFilter = 'pending'; S.regexPos = null;
            /* ★W103-丁/己：两颗范围开关回到**默认规则**算出来的那一档（整份 ⇒ 两个都勾；只改条目 ⇒ 只勾条目；
               只改正则 ⇒ 只勾正则），窗口头那行的"展开"也归位（新一次对比 = 别把上一轮的展开带进来）。 */
            { const dz = defaultScopeOf(an); S.scopeItems = dz.items; S.scopeRx = dz.rx; }
            /* ★★W111-③（作者原话："取消点击后 我发现这些被筛选的内容放在所有条目的最下面……
               你去和预设条目一起统一"）：这个包**主体是正则**（条目一条都不用你拍板、正则这边有要你处理的）
               ⇒ 把正则摆到眼前：条目堆收成一根条（`scopeItems = false`）、正则摊开（`scopeRx = true`）
               —— 与"条目包开完就停在待我处理、要处理的那几条就在眼前"（W94）同一手感，只是镜像。
               ★**必须排在 `defaultScopeOf()` 之后**：Wave G 当年那条（`S.scopeRx = true`）就是死在
                 这一行赋值把它盖掉上（"顺序写反"——作者那条正则卡开完看不到正则的根因之一）。
               ★混包（`needDecide > 0` = 条目这边也有要拍板的）不归它管 ⇒ 仍按 `defaultScopeOf()`
                 （两摊都摊开；用户点那两根条随时收/放）。 */
            if (an.stats.needDecide === 0 && (S.regexItems || []).some(it => PM.regexNeedsChoice(it))) {
                S.scopeItems = false; S.scopeRx = true;
            }
            S.headOpen = false;
            /* ★W95 ④：**新一次对比 = 每行的"点开没点开"也归零**（全部收起）—— 跟 `regexTouched` 同一个口径：
               别让上一轮点开的那几行在下一份预设上"莫名其妙是开的"（新一份的 key 也全都不一样）。 */
            S.regexRowOpen = {};
        }
        renderAll();
        const st = an.stats;
        const rxN = (S.regexItems || []).length;
        toast('success', `对比完成：共 ${st.total} 条 · 需要你选 ${st.needDecide} 条`
            + (rxN ? ` · 另有 ${rxN} 条正则${(!preserve && st.needDecide === 0 && S.scopeRx !== false) ? '（已展开，就在下面）' : ''}` : '')
            + ` · ${st.threeWay ? '三方对比' : '两方对比'}`);
    } catch (e) {
        toast('error', e.message);
        console.warn('[预设更新器] 对比失败', e);
    }
}

/** ★R8：把"预设级正则"的对比算进 S（纯数据，界面只负责画；UI 批次接手时不用再碰内核）
 *  · 两边都没有正则 → S.regexItems = null（整块不渲染，老流程一个字不变）
 *  · 有 → 逐条决策按内核的兜底值预填（"默认不覆盖你已有的"，用户随时能改） */
function analyzeRegexesIntoState(keepRx) {
    try {
        const an = PM.analyzeRegexes({ mine: S.mine, next: S.next, base: S.regexBase || S.base || null });
        S.regexItems = an.items.length ? an.items : null;
        S.regexStats = an.stats;
        S.regexNotice = an.notice || [];
        S.regexDecisions = {};
        for (const it of (S.regexItems || [])) {
            /* ★★W99-丙（作者原话："我不是说**不要默认有选择**吗？……**不要默认**"）：
               改前这里写的是 `kept || PM.fallbackRegexDecision(it)` —— 一进对比页每条正则就被**预填兜底值**
               ⇒ 行里「用新名字 / 还原旧状态 / 用我的 / 保留 / 加进来」**默认就亮着**（作者点名的正是这五个），
               而且"没选"只能靠 `regexTouched` 那份名单间接表达。
               现在：**没亲手选过 = 决策表里没有这一条**（空对象），界面照旧一个亮着的都没有；
               内核合成时的兜底（`mergeRegexes` 的 `decOf` → `fallbackRegexDecision`）**一个字没动**
               —— 真没选完就点生成，照旧由 `askPendingAnyway()` 那道确认框拦（"没处理的按老规矩兜底"）。 */
            const kept = keepRx && keepRx[it.key];
            S.regexDecisions[it.key] = kept || {};
        }
    } catch (e) {
        S.regexItems = null;
        S.regexStats = null;
        S.regexNotice = [];
        console.warn('[预设更新器] 正则对比失败（不影响条目那套）', e);
    }
}

function renderAll() { renderHead(); renderView(); renderFoot(); applyAutoInkAll(); }   // ★R7：画完就过一遍"自动取色 + 对比兜底"

function renderHead() {
    const sub = $el('#ywpu-head-sub');
    // ★P7（§15）：从商店来的这次对比，标题区照实写**来源**（谁的东西、缝进你哪一份）——
    //   用户原话是"我在商店点的那条，怎么跑到更新器里来了？" —— 写清楚就不迷糊。
    // ★M11：预览（伪缝入）时**必须一眼看出"这里点了不会写盘"**（否则用户以为真缝了）。
    const pvTag = S.preview ? ' · 👁 预览（伪缝入，不会写盘）' : '';
    if (sub) {
        if (S.store) {
            /* ★★W103-己（作者原话）："☁ 来自商店：《…》 · 缝进 X 这个有两个地方有 ⇒ **保存上面那个**
               （上面那个做一个**展开**），下面的卡片里的可以丢弃；而且 来自商店的… 的字体颜色
               以及 缝进 后面跟着的预设名的字体颜色 **要有所区分**。"
               · 这一行（窗口头第 2 行）就是"上面那个"：标题长了会被省略号截住 ⇒ **点这一行**看全标题
                 （W106 ③：那颗独立的「展开」按钮已按作者要求删掉；全标题画在 #ywpu-head-full 浮层里、
                 不推挤不位移，再点一次收起，见本函数尾部与 CSS 的 .ywpu-subfull）。
               · 两段色分开：`☁ 来自商店：《…》` 走 `.ywpu-storeink`（官方/商店那一族的 ink），
                 `缝进` 后面那个预设名走 `.ywpu-pname`（与来源块里"预设名"同一个记号）—— 两个都 ≥4.5。
               ★文字与改前**逐字相同**（`run-store-e2e` 按 `#ywpu-head-sub` 的 textContent 钉着这条），
                 浮层 `#ywpu-head-full` 是**兄弟节点**（不在 sub 里）⇒ textContent 一个字符都没多。 */
            sub.innerHTML = '<span class="ywpu-storeink">☁ 来自商店：《' + esc(S.store.title) + '》</span>'
                + ' · 缝进 <span class="ywpu-pname">' + esc(S.mineName || '你的预设') + '</span>' + esc(pvTag);
        } else {
            sub.textContent = (S.mineName || S.nextName ? `${S.mineName || '我的预设'} → ${S.nextName || '新版预设'}${S.baseName ? '（基准：' + S.baseName + '）' : '（两方对比）'}${pvTag}` : '');
        }
    }
    /* ★W106 ③：那行的"展开/收起"随行本身（绑定见 buildWindow）——这里只刷浮层与游标：
       非商店路整块不显示；商店路按 S.headOpen 显示全标题（内容 = 那一行**同一份 HTML**，一个字不多不少）。 */
    const subEl = $el('#ywpu-head-sub');
    const full = $el('#ywpu-head-full');
    if (full) {
        const on = !!(S.store && S.headOpen);
        if (on && subEl) full.innerHTML = subEl.innerHTML;
        full.hidden = !on;
    }
    if (subEl) {
        subEl.classList.toggle('ywpu-sub-click', !!S.store);
        subEl.title = S.store ? '点这一行看完整标题（再点一次收起）' : '';
    }
    renderBatchBar();
    const t1 = $el('#ywpu-tab-items'), t2 = $el('#ywpu-tab-order'), t3 = $el('#ywpu-tab-store');
    if (t1) t1.classList.toggle('ywpu-sel', S.view === 'items');
    if (t2) t2.classList.toggle('ywpu-sel', S.view === 'order');
    if (t3) t3.classList.toggle('ywpu-sel', S.view === 'store');
}

/** ★F2：商店「一键更新全部有更新的卡」带过来的一批 —— 页顶那条"一起挑"的进度条（没批量时是空的）。
 *  只画进度与切换按钮：**不写盘、不自动改任何东西**（写盘还是用户点「生成新预设」）。 */
function renderBatchBar() {
    const host = $el('#ywpu-storebatch');
    if (!host) return;
    const b = S.storeBatch;
    if (!b || !b.items.length) { host.innerHTML = ''; return; }
    const n = b.items.length, i = Math.max(0, Math.min(b.i, n - 1));
    const it = b.items[i] || {};
    const title = String(it.title || (it.card && it.card.title) || '（这张没写标题）');
    host.innerHTML = `<span class="ywpu-batchpill">📦 一起挑 <b>${i + 1}/${n}</b></span>`
        + `<span class="ywpu-batchname" title="${esc(title)}">《${esc(title)}》</span>`
        + `<span class="ywpu-note"><b>不会自动改</b>：挑完点右下角「生成新预设」才写盘，写完自动带出下一张</span>`
        + `<span class="ywpu-flex ywpu-batchbtns">`
        + `<button class="ywpu-btn ywpu-mini" data-batch-go="prev"${i <= 0 ? ' disabled' : ''}>← 上一张</button>`
        + `<button class="ywpu-btn ywpu-mini" data-batch-go="next"${i >= n - 1 ? ' disabled' : ''}>下一张 →</button>`
        + `<button class="ywpu-btn ywpu-mini" data-batch-go="exit" title="只对付手上这一张（这一批剩下的以后再说）">只挑这张</button>`
        + `</span>`;
}

/** ★F2：写盘成功后自动带出下一张（没有批量 / 已是最后一张 → false，调用方照常关窗收工）。
 *  ★只在**写盘成功**后调它（没写盘就跳张 = 等于悄悄丢掉用户刚挑的东西，绝对不做）。 */
function storeBatchAdvance(why) {
    const b = S.storeBatch;
    if (!b || !b.items.length) return false;
    const next = b.i + 1;
    if (next >= b.items.length) {
        toast('success', '这一批 ' + b.items.length + ' 张都挑完了 —— 都写好了');
        S.storeBatch = null; renderBatchBar();
        return false;
    }
    const ok = openStoreItemAt(next);
    if (ok) toast('success', (why || '这一张好了') + ' → 自动带出第 ' + (next + 1) + '/' + b.items.length + ' 张');
    return ok;
}

function renderView() {
    const items = $el('#ywpu-view-items'), order = $el('#ywpu-view-order'), store = $el('#ywpu-view-store');
    if (items) items.style.display = S.view === 'items' ? '' : 'none';
    if (order) order.style.display = S.view === 'order' ? '' : 'none';
    if (store) store.style.display = S.view === 'store' ? '' : 'none';
    renderHead();
    if (S.view === 'items') renderResult();
    else if (S.view === 'order') renderOrderView();
    // 商店页自己会画（模块成功加载时才有 window.__ywstore；没有就显示一句人话，不报错）
    else if (S.view === 'store' && store) {
        if (!store.dataset.ywsMounted) {
            if (window.__ywstore && typeof window.__ywstore.mount === 'function') window.__ywstore.mount(store);
            else store.innerHTML = '<div class="ywpu-note" style="padding:12px">条目商店模块没加载（发布版里就没有它）</div>';
        } else if (window.__ywstore) window.__ywstore.render();
    }
}

// ---------------------------------------------------------------- 颜色（可自选）

/** 可自选的颜色：7 个条目状态 + 3 个正文底色。
 *  用户 v3.8：「不用太多、别互相盖住、别花里胡哨」→
 *    ① 作者改过/你改过/双方都改/两边不同 合并成一个「两边不一样」（紫），到底谁改的写在悬浮说明里；
 *    ② 红色只留给「还没处理」，全界面唯一的红 → 一眼看见还剩哪些没管，再也不会被别的色盖住。
 *  ★第 4 列必须和 preset-updater.css 里的 --yst-xx / --ywd-xx 默认值一字不差，
 *    否则用户没改过颜色时，图例色块显示的颜色和界面真实颜色不一样（色块骗人）。 */
const COLOR_DEFS = [
    ['new', '新版新增', '--yst-new', '#4ade80'],
    ['old', '只有我有', '--yst-old', '#fbbf24'],
    /* ★W107-③（作者原话："改了名字和改了内容 这两个放置的区域 顺序是不是反了 把它调整过来"）：
       下面两行**对调**（改了名字在前、改了内容在后）—— 与筛选那排 chips 的既有次序一致
       （`FILTERS` 里 renamed 本就在 both 前面）。COLOR_DEFS 是色板/图例的同一个数据源 ⇒ 两边一起换序。 */
    ['renamed', '改了名字', '--yst-renamed', '#22d3ee'],
    ['both', '改了内容', '--yst-both', '#a78bfa'],
    ['switch', '改了开关', '--yst-switch', '#60a5fa'],
    ['same', '内容一样', '--yst-same', '#9ca3af'],
    ['warn', '还没处理', '--yst-warn', '#f87171'],
    ['chg', '正文·改动', '--ywd-chg', '#fbbf24'],
    ['add', '正文·新增', '--ywd-add', '#4ade80'],
    ['del', '正文·删除', '--ywd-del', '#f87171'],
];

// ---------------------------------------------------------------- ★R7「自动取色 + 对比兜底」一般化
/*  ★R7（2026-09-21 · 台账 §O 主题自适应）：商店那边 P2-8 给卡片标题加了一道"算一次对比度、不够就朝白/黑推"。
    作者的要求是**所有关键元素**都这样（"浅色和深色都要适配、自动取色做到兼容各种各样的预设，
    清晰不混乱、高级不冲突"）→ 这一层把同一门手艺推广到更新器的每个关键元素：
    正文三档 / 次要文字 / 徽标 / 状态标记 / 筛选标签 / 提示条 / 按钮文字 / 输入框 / 胶囊 / 红蓝差异块。
      · 判据统一：**正文类 ≥4.5 / 装饰类 ≥3.0**；不达标 → 先**保色相**地抬不透明度，再朝白/黑推（色相角不动）
      · 达标 → 什么都不写（撤掉上次的内联覆盖）→ 你现在的主题一个字都不变，零回归面
      · P1-4 那套 `-ink` 令牌族（品牌色混正文色）**一个字没推翻**：这一层只在"它还不够"的档位上再兜一道
    做法（不碰 CSS：令牌族照旧，兜底值用**内联变量**盖上去）：
      ① 量面板里**每个自己带字的元素**的真实对比度（底色逐层合成，口径 = e2e/probe-store-light.js 的 __LC）；
      ② 元素计算色 == 某个令牌的解析值 → 归到那个令牌，一族里**最差的元素**说了算；
      ③ 不是令牌族 / 被 opacity 压着的 → 只给那个元素上内联 color（宁可丑，不许读不清）；
      ④ 只有"主题/宽度/DOM 换了一批"才重量（key + isConnected 缓存），不是每帧算。 */
const INK_TOKENS = ['--ywpu-txt', '--ywpu-txt-2', '--ywpu-txt-3', '--ywpu-accent-ink', '--ywpu-gold-ink',
    '--yst-new-ink', '--yst-renamed-ink', '--yst-old-ink', '--yst-both-ink', '--yst-switch-ink', '--yst-same-ink',
    '--yst-warn-ink', '--yst-author-ink', '--yst-mine-ink', '--yst-2way-ink',
    '--ywd-chg-ink', '--ywd-add-ink', '--ywd-del-ink'];
/** 装饰类（判据 3.0 而不是 4.5）：**故意调暗**的"没被选中的那一组"与拖动把手（图形，不是正文）。
 *  作者对那个 opacity 有明确要求（"点的那组盖印章、没选的那组变暗"）→ 硬按 4.5 判会逼着产品改设计意图。
 *  ★**C7（2026-09-23 · `视觉与主题评审-夜间.md` §2.3）这条曾经"糊"掉过一次**：
 *    原来两条写在一起（`.ywpu-grp:not(.ywpu-on):not(.ywpu-grp-act), .ywpu-dragh`），可**没定过**这一条时
 *    （`data-decided="0"`）两组 `opacity` 都是 1、**谁都没暗**（CSS `.ywpu-patch[data-decided="0"] .ywpu-grp{opacity:1}`），
 *    那两块底上的字就是**正文**，得按 4.5 判。旧写法按 3.0 判 ⇒ 实测放过 12 档浅色主题上 4.05~4.64 的版名
 *    （真主题 Azure 3.09 / 双色盒子-浅色 3.60）——"修复带出来的一处"就是这么漏过去的。
 *    现在拆两族：**永远装饰**（拖动把手 = 图形）与**只有真的被压暗了才算装饰**（没选中那一组，opacity<1）。 */
const INK_DECOR_ALWAYS = '.ywpu-dragh';
/** 没被选中的那一组（变暗写在它自己身上 —— 字在它里面，所以判"暗没暗"要读**这个祖先**的 opacity） */
const INK_DECOR_DIM = '.ywpu-grp:not(.ywpu-on):not(.ywpu-grp-act)';
/** ★A-1（wave4 · 2026-09-26）：**分隔符箭头**（`.ywpu-renarrow` 改名中间的「→」、`.ywpu-arrow` 开关的「→」）
 *  —— 作者 Z7 定的口径是"**普通文字色 + 自己的透明度**"（`.ywpu-renarrow{color:var(--ywpu-txt);opacity:.55}`
 *  / `.ywpu-arrow{opacity:.6}`），**不是**"给它单独挑一个色"。
 *  但兜底层以前把"被 opacity 压着的元素"按 4.5 判、而且 `useTok` 要求 `op>=0.999` ⇒ 它给这两个箭头写**元素级**
 *  `color`（浅色 0.55 下永远到不了 4.5 ⇒ 走"推到极限"那一支，实测浅色档被推成 `rgb(0,0,0)`、深色档推成
 *  `rgb(225,234,243)`）—— 于是"改名箭头"与同一行的普通文字**不是一个色**了（验收两档都红；`run-updater-extras`
 *  ⑦b 那条断言"箭头色 === 普通文字色"就是这么红的）。
 *  ⇒ 口径：这两个箭头**只跟着 `--ywpu-txt` 走**（家族被抬时它自动跟着变，家族不动时保持主题原色），
 *    **永远不写元素级 color**。它们的透明度是作者定的装饰（跟"没选中那组变暗"同一类），不是正文。 */
const INK_FOLLOW_TOKEN = '.ywpu-renarrow, .ywpu-arrow';
/** 商店的地盘（商店自己有同一套兜底，两边各修各的，别互相覆盖） */
const INK_SKIP = '.yws-host, #ywpu-view-store, #yws-dlg-host';
const INK_ROOTS = ['#ywpu-root', '#ywpu-card', '#ywpu-sheet', '#ywpu-cmp', '#ywpu-patch'];
/** ★A-3（wave4 · 2026-09-26）：量之前先把**本面板内**的 CSS 过渡关掉。
 *  根因（本轮实测坐实，见 `wave4-修复-夜间.md`）：兜底层是**同步**量的，而 `.ywpu-item` / `.ywpu-btn` /
 *  `.ywpu-src` 这些元素带 `transition: background .12s`；`--ywpu-txt` 一被抬，它们的底色**当场开始 120ms 过渡**
 *  ⇒ 同一帧里（以及后面几轮）再 `getComputedStyle`，拿到的是**过渡起点值 ≈ 抬之前那个底**
 *  （实测：底 写前 rgb(239,185,185) → 刚写完 **rgb(249,195,195)** → 1 秒后 rgb(239,185,185)）。
 *  于是它按"抬之前的底"算，以为够了；等过渡结束（= 用户真正看到的）就差了 0.35~0.45
 *  （浅色档 4.39~4.45 / Azure 4.20~4.42 ⇒ 验收读到的那批残留）。**这不是"余量不够"**，
 *  余量抬到 0.6 也救不了（抬余量只会让解更极端）—— 是底量错了。
 *  做法：算之前挂一条只作用于本面板的 `transition:none !important`，**算完立刻停用**（元素留着，下次零成本）。
 *  实测（`e2e/tmp/w4-notrans*.log`）：关过渡后浅色毛玻璃-低对比 **18 → 0**、同色系-浅米 **2 → 0**、
 *  真·双色盒子-浅色 **1 → 0**、Azure/低对比-白底5.0 → **0**。 */
const INK_NT_STYLE_ID = 'ywpu-notrans';
function inkNoTransition(on) {
    try {
        let s = document.getElementById(INK_NT_STYLE_ID);
        if (on) {
            if (!s) {
                s = document.createElement('style');
                s.id = INK_NT_STYLE_ID;
                s.textContent = INK_ROOTS.map(r => r + ' *').join(', ') + ' { transition: none !important; }';
                (document.head || document.documentElement).appendChild(s);
            }
            s.disabled = false;
        } else if (s) {
            s.disabled = true;      // ★只停用规则（元素留着 → 下次开它零成本，不留垃圾节点）
        }
    } catch (e) { /* 拿不到 DOM 也不影响：量到的是过渡中间值，最多回到本批之前的行为 */ }
}
const _inkStates = new WeakMap();
let _inkLog = '';
const inkParse = (s) => {
    const t = String(s == null ? '' : s).trim(); if (!t) return null;
    let m = t.match(/^rgba?\(([^)]+)\)$/i);
    if (m) { const p = m[1].split(/[,\/]/).map(x => parseFloat(x)); return (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) ? { r: p[0], g: p[1], b: p[2], a: (p.length > 3 && Number.isFinite(p[3])) ? p[3] : 1 } : null; }
    m = t.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i);
    if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] === undefined ? 1 : +m[4] };
    m = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1]; return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }
    return null;
};
const inkLum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const inkRatio = (a, b) => { const L1 = inkLum(a), L2 = inkLum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
const inkMix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 });
const inkOver = (fg, a, bg) => ({ r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 });
const inkCss = (c, a) => 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + (a >= 0.999 ? 1 : Math.round(a * 1000) / 1000) + ')';
/** 把一个颜色修到"在**所有**给定底色上都达标"（① 抬不透明度保色相 ② 朝白/黑推；都不行返回极限值）
 *  ★`op` = 元素**自己的 opacity**：写进 color 的 alpha 还要乘它才是屏幕上真正的 alpha ——
 *    被 opacity 压着的元素（禁用态 / 作者要的"没选中的那组变暗"）抬 alpha 是**白抬**（乘完还是 .45），
 *    所以判据一律按 `alpha × op` 算，抬不动就只剩"朝白/黑推"（实测拖动手柄 2.59 → 3.06 过关）。
 *  ★`pairs` = [{bg, need}]：同一族里可能既有 4.5 的正文又有 3.0 的禁用态/装饰块 → 逐条按自己的阈值判。 */
function inkSolve(base, alpha, op, pairs, need, safe) {
    const o = (op > 0 && op < 1.0001) ? op : 1;
    /* ★试过把余量抬到 0.6（想盖住"pairs 只记 24 个底"这点模型差）—— **实测更差**：
       高饱和绿底的「两组绿底·整组」从 3.58 掉到 2.80（目标太高 ⇒ 整族无解 ⇒ 走极端色），
       只换来版名/叶 +0.2。⇒ **保持 0.35**（本批读数就是这一版量的）。 */
    const hit = (c, a) => pairs.every(p => inkRatio(inkOver(c, Math.min(1, a) * o, p.bg), p.bg) >= (p.need || need) + (safe == null ? 0.35 : safe));
    if (hit(base, alpha)) return { c: base, a: alpha, ok: true };
    for (let a = Math.min(1, alpha + 0.02); a <= 1.0001; a += 0.02) if (hit(base, a)) return { c: base, a: Math.min(1, a), ok: true };
    for (const target of [{ r: 255, g: 255, b: 255, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }]) {
        for (let t = 0.04; t <= 1.0001; t += 0.04) {
            const c = inkMix(base, target, Math.min(1, t));
            if (hit(c, 1)) return { c, a: 1, ok: true };
        }
    }
    /* ★C7 §2.6（2026-09-23）：最后一招**按实际底色算对比度选端**，不许再"按这一族底色的平均亮度"拍脑袋 ——
       旧写法（平均亮度 < 0.42 就挑白）实测在「高饱和橙底」那档上挑了**白**（白字压橙底 2.66），
       而**同一块底黑字能给到 7.89**。现在：白端与黑端各算一遍"在**所有**底色上的**最低**对比度"（minimax），
       谁高挑谁 —— 数学上不可能比旧选法更差（旧选法本来就只是这两端之一），同分时仍按平均亮度保持老行为。
       ★`split`：这一族**一个色救不了所有人**（底色有的偏亮、有的偏暗，白端黑端都过不了全部）⇒
         交给调用方**逐个元素按它自己的底色挑色**（同一个 inkSolve，只是 pairs 换成一个底）。
         C7 §2.6 原话就是这么建议的："让兜底层按元素实际底色分别挑色（现在是'整族一个色'）"。 */
    const worstOf = (t) => pairs.reduce((m, p) => Math.min(m, inkRatio(inkOver(t, o, p.bg), p.bg)), 99);
    const W = { r: 255, g: 255, b: 255, a: 1 }, K = { r: 0, g: 0, b: 0, a: 1 };
    const wW = worstOf(W), wK = worstOf(K);
    const split = pairs.length > 1;      // 单元素组（只有一个底）没得拆，按下面的端走就行
    if (wW !== wK) return { c: wW > wK ? W : K, a: 1, ok: false, split };
    const dark = pairs.reduce((s, p) => s + inkLum(p.bg), 0) / (pairs.length || 1) < 0.42;
    return { c: dark ? W : K, a: 1, ok: false, split };
}
/** 量一个宿主 + 按需修正
 *  ★**最多扫 3 轮**：令牌之间有耦合 —— `--ywpu-txt` 同时是"正文色"和"表面色"的原料
 *    （`--ywpu-surface: color-mix(txt 6%, transparent)`），把它朝黑推之后**底也跟着变深**，
 *     一轮算出来的修正值可能刚好又不够。做法：改完再量一遍，还不够就接着修（单调收敛），
 *     直到一轮下来什么都没有（正常主题第一轮就没东西可修，等于零开销）。 */
function applyAutoInk(root) {
    try {
        if (!root || !root.isConnected) return;
        const st = _inkStates.get(root) || { key: '', vars: [], els: [] };
        _inkStates.set(root, st);
        const cs0 = getComputedStyle(root);
        // ★key 里必须有 **视图 + 元素个数**：换一页（条目页 → 顺序页 → 条目面板）会换掉整批元素，
        //   只看主题的话新长出来的元素永远轮不到（商店侧同一个坑：`.yws-rights` 一直没人管）。
        const key = [String(S.view), root.clientWidth, root.querySelectorAll('*').length,
            cs0.getPropertyValue('--SmartThemeBodyColor').trim(),
            cs0.getPropertyValue('--SmartThemeBlurTintColor').trim(), cs0.getPropertyValue('--ywpu-txt').trim(),
            cs0.getPropertyValue('--yst-new').trim(), cs0.getPropertyValue('--yst-warn').trim()].join('|');
        if (key === st.key && st.els.every(e => e.isConnected) && st.vars.every(v => root.style.getPropertyValue(v))) return;
        st.key = key;
        /* ★A-3：从"撤上一次"到"这一轮算完"之间**关掉本面板的 CSS 过渡** ——
           否则量到的是过渡起点（≈ 上一次的底），按错底解色（根因与实测见 inkNoTransition 的注释）。
           ★恢复点有两个：正常收尾在 probe.remove() 后面；出异常由外层 catch 兜（绝不留着关过渡的状态）。 */
        inkNoTransition(true);
        for (const v of st.vars) root.style.removeProperty(v);      // 先撤上一次的 → 量到的永远是"主题原样"
        st.vars = [];
        for (const e of st.els) if (e.isConnected) e.style.removeProperty('color');
        st.els = [];
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;pointer-events:none';
        root.appendChild(probe);
        const log = [];
        let touchedAny = false;           // ★A-3b：**跨轮**记"这一趟到底动过没有"（收尾复核只在动过时才跑）
        /* ★A-3：`noCache=true` 时**不查缓存也不写缓存**（给 fix2 与收尾复核用）——
           它们是在"令牌/颜色已经写下去之后"跑的，缓存里那份底是**写之前**的，
           拿它复核等于"按旧底说它达标"（实测就是这一条放过了 4.39~4.45 那批）。
           ★`stackCache` 每轮换一个新对象（轮内复用、跨轮不串），所以它在轮循环里重置。 */
        let stackCache = new WeakMap();
        const stackOf = (n, noCache) => {
            if (!n || n.nodeType !== 1) return { base: null, list: [] };
            if (!noCache) { const hit2 = stackCache.get(n); if (hit2) return hit2; }
            const own = inkParse(getComputedStyle(n).backgroundColor);
            const up = n.parentElement ? stackOf(n.parentElement, noCache) : { base: null, list: [] };
            let out;
            /* ★祖先已经有实底时，**自己这一层不能丢**——元素自己的半透明底（--ywpu-raise 那种）也是底的一部分。
               丢了它，兜底层算出来的底比量具（e2e 的 __LC.bgOf）偏亮 → 它以为够了、量具量出来差一截（实测 2.83 vs 2.93）。 */
            if (up.base) out = { base: up.base, list: (own && own.a > 0 ? up.list.concat([own]) : up.list) };
            else if (own && own.a >= 0.999) out = { base: own, list: [] };
            else out = { base: null, list: (own && own.a > 0 ? up.list.concat([own]) : up.list) };
            if (!noCache) stackCache.set(n, out);
            return out;
        };
        const bgOf = (el, noCache) => { const s = stackOf(el, noCache); let out = s.base || { r: 255, g: 255, b: 255, a: 1 }; for (const l of s.list) out = inkOver(l, l.a, out); return out; };
        /** ★A-3b（wave4）：**两端都过不了**的时候，别"按写之前的底估算哪一端更好"，而是**真的写一次、量一次**再选。
         *  为什么：有些元素的底是**跟着自己的字色**走的 —— 筛选标签 `.ywpu-fbtn` 的
         *    `background: color-mix(in srgb, currentColor 26%, transparent)`（CSS:303/305）。
         *    估算法只看"写之前那个底"：实测高饱和蓝底的「全部 160」——写之前底是亮的 ⇒ 估算"黑好"，
         *    可黑一写下去底也跟着变黑 ⇒ 实际只剩 **1.98**；而白其实有 **4.17**（写白时底跟着变亮）。
         *    更糟的是轮次之间会**来回翻**（白→底变亮→下一轮又觉得黑好…），最后一轮停在哪端全看奇偶。
         *  ⇒ 两端各写一次、各量一次（`bgOf(el, true)` 不查缓存），留**实际更好**的那一端。
         *  只在"这一档两端都到不了目标"时才会走到（正常主题一次都不写、一次都不多量）。 */
        const inkEndByMeasure = (el) => {
            const ends = [{ r: 255, g: 255, b: 255, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }];
            let best = null;
            for (const e2 of ends) {
                el.style.setProperty('color', inkCss(e2, 1));
                const bgN = bgOf(el, true);          // 这一端刚写下去，底可能跟着变 → 必须重量
                const r = inkRatio(inkOver(e2, 1, bgN), bgN);
                if (!best || r > best.r) best = { c: e2, r: r };
            }
            el.style.setProperty('color', inkCss(best.c, 1));
            if (!st.els.includes(el)) st.els.push(el);
            return best;
        };
        for (let round = 0; round < 3; round++) {
        stackCache = new WeakMap();      // ★每轮一份新缓存（轮内复用、跨轮不串：上一轮的底可能已经被这一轮之前的写改掉了）
        const byColor = new Map();
        for (const t of INK_TOKENS) {
            probe.style.color = '';
            probe.style.color = 'var(' + t + ')';
            const s = getComputedStyle(probe).color;
            const c = inkParse(s);
            if (!c) continue;
            const row = byColor.get(s) || { list: [], base: c };
            row.list.push(t);
            byColor.set(s, row);
        }
        const groups = new Map();
        for (const el of root.querySelectorAll('*')) {
            if (el === probe || el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
            if (el.closest(INK_SKIP)) continue;
            /* ★A-1：分隔符箭头（改名 / 开关的「→」）**只跟着 --ywpu-txt 走**，不单独判、不单独改色
               （口径见 INK_FOLLOW_TOKEN 的注释：作者定的是"普通文字色 + 自己的透明度"）。 */
            if (el.closest(INK_FOLLOW_TOKEN)) continue;
            let hasText = false;
            for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) { hasText = true; break; }
            if (!hasText) continue;
            const rc = el.getBoundingClientRect();
            if (rc.height <= 0 || rc.width <= 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            const c = inkParse(cs.color);
            if (!c) continue;
            const op = +(parseFloat(cs.opacity) || 1);
            /* *完全透明的字是**故意**看不见的（向导步骤之间那种占位字形）—— 那不是“对比度不够”，
               跳过、别去动它（第一版把它的 color 改成不透明 = 凭空画出一堆不该出现的字形）。 */
            if (c.a * op < 0.02) continue;
            const a = Math.max(0.001, c.a * op);
            const bg = bgOf(el);
            /* ★C7：判据按**这一组到底暗没暗**来 —— 变暗写在 `.ywpu-grp` 上、字在它里面，
               所以要读**那个祖先自己**的 opacity（字自己那一层恒为 1，读它是永远判不出"暗了"的）。 */
            const dimEl = el.closest(INK_DECOR_DIM);
            const dimmed = !!dimEl && (+(parseFloat(getComputedStyle(dimEl).opacity) || 1)) < 0.999;
            const need = (el.closest(INK_DECOR_ALWAYS) || el.disabled || (el.getAttribute && el.getAttribute('disabled') != null)) ? 3.0
                : (dimmed ? 3.0 : 4.5);
            const ct = inkRatio(inkOver({ r: c.r, g: c.g, b: c.b, a: 1 }, a, bg), bg);
            const margin = ct - need;
            const gk = cs.color + '@' + a.toFixed(3) + '#' + op.toFixed(3);   // ★op 也要进键：同一组里混不同 opacity 的元素，hit 只认组里那一个 op，会误判成已达标
            const g = groups.get(gk) || { color: cs.color, base: { r: c.r, g: c.g, b: c.b, a: 1 }, alpha: c.a, op, n: 0, pairs: [], els: [], margin: 99, worst: null };
            g.n++;
            g.els.push({ el, bg, need });
            // 一个底色只留一条（最多记 6 个）——阈值按**那个元素自己的**算（禁用态 3.0 / 正文 4.5）
            if (g.pairs.length < 24 && !g.pairs.some(p => Math.round(inkLum(p.bg) * 200) === Math.round(inkLum(bg) * 200) && p.need === need)) g.pairs.push({ bg, need });
            // 这一组"最要紧"的元素 = **余量最小**的那个（不是对比度最低的那个：3.0 档的和 4.5 档的不能比 ct）
            if (margin < g.margin) { g.margin = margin; g.worst = { bg, ct, el, need, txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18) }; }
            groups.set(gk, g);
        }
        let touched = 0;
        for (const g of groups.values()) {
            const need = g.worst ? g.worst.need : 4.5;
            const tok = byColor.get(g.color) || null;
            if (g.margin >= 0) continue;
            const useTok = tok && (g.op >= 0.999);      // 被 opacity 压着的元素改令牌也救不了它自己
            const base = useTok ? tok.base : g.base;
            const alpha = useTok ? (tok.base.a || 1) : g.alpha;
            const sv = inkSolve(base, alpha, g.op, g.pairs, need);
            /* ★C7 §2.6：这一族"一个色救不了所有人"（白端黑端都过不了全场）⇒ **逐个元素按它自己的底色挑色** ——
               同一个 inkSolve，只是 pairs 收成那一个底。到这一步本来就没有可用色，拆开只会更清楚。 */
            if (useTok && sv.split) {
                for (const it of g.els) {
                    const one = inkSolve(base, alpha, g.op, [{ bg: it.bg, need: it.need }], it.need);
                    /* ★A-3b：两端都不行 ⇒ 写一次量一次再选端（底跟着自己的字色走的元素，估算法会估反） */
                    if (!one.ok) { inkEndByMeasure(it.el); continue; }
                    it.el.style.setProperty('color', inkCss(one.c, one.a));
                    if (!st.els.includes(it.el)) st.els.push(it.el);
                }
                log.push('整族救不了→按底色分挑[' + (g.worst && g.worst.el ? String(g.worst.el.className || g.worst.el.tagName).split(' ')[0] : '?') + ']「' + (g.worst ? g.worst.txt : '') + '」'
                    + g.worst.ct.toFixed(2) + '→' + need + '（' + g.n + ' 处）');
                touched++;
                continue;
            }
            const css = inkCss(sv.c, sv.a);
            if (useTok) {
                for (const v of tok.list) { root.style.setProperty(v, css); st.vars.push(v); }
                log.push(tok.list[0] + ' ' + g.worst.ct.toFixed(2) + '→' + inkRatio(inkOver({ r: sv.c.r, g: sv.c.g, b: sv.c.b, a: 1 }, Math.min(1, sv.a) * (g.op < 1 ? g.op : 1), g.worst.bg), g.worst.bg).toFixed(2) + '（' + g.n + ' 处）');
            } else if (!sv.ok) {
                /* ★A-3b：整组两端都过不了 ⇒ 逐个元素"写一次量一次"选端（理由见 inkEndByMeasure） */
                for (const it of g.els) inkEndByMeasure(it.el);
                log.push('元素级[' + (g.worst && g.worst.el ? String(g.worst.el.className || g.worst.el.tagName).split(' ')[0] : '?') + ']「' + (g.worst ? g.worst.txt : '') + '」' + g.worst.ct.toFixed(2) + '→' + need + '（★这一档主题做不到，两端各量一次选了实际更好的那一端）');
            } else {
                for (const it of g.els) {
                    it.el.style.setProperty('color', css);
                    if (!st.els.includes(it.el)) st.els.push(it.el);
                }
                log.push('元素级[' + (g.worst && g.worst.el ? String(g.worst.el.className || g.worst.el.tagName).split(' ')[0] : '?') + ']「' + (g.worst ? g.worst.txt : '') + '」' + g.worst.ct.toFixed(2) + '→' + need);
            }
            /* ★`pairs` 最多记 24 个底（性能）—— 排在后面的底**可能没进过那份清单**，于是"这一族算出来够了"
               而它在某个没进清单的底上其实不够（实测：低对比-白底4.7 的粉底就排在 24 名之后 ⇒ 4.45）。
               写完之后拿**每个元素自己的底**复核一遍，没达标的按它自己的底再挑一次（同一个 inkSolve）——
               这就是 C7 §2.6 要的"按元素实际底色分别挑色"，只是**只挑那几个不达标的**、不动整族。
               ★A-3：这里的底必须**当场重量**（`noCache`，见 stackOf 的注释）—— 上面刚写了令牌，
                 令牌一动，"按 txt 混出来的那些底"（item/doc/panel/raise）当场就变了（本批已关过渡 ⇒ 立刻生效）。 */
            let fix2 = 0;
            for (const it of g.els) {
                const bgNow = bgOf(it.el, true);
                if (inkRatio(inkOver({ r: sv.c.r, g: sv.c.g, b: sv.c.b, a: 1 }, Math.min(1, sv.a) * (g.op < 1 ? g.op : 1), bgNow), bgNow) >= it.need) continue;
                const one = inkSolve(sv.c, sv.a, g.op, [{ bg: bgNow, need: it.need }], it.need);
                if (!one.ok) { inkEndByMeasure(it.el); fix2++; continue; }   // ★A-3b：两端都不行 → 写一次量一次选端
                it.el.style.setProperty('color', inkCss(one.c, one.a));
                if (!st.els.includes(it.el)) st.els.push(it.el);
                fix2++;
            }
            if (fix2) log.push('（另有 ' + fix2 + ' 处按自己的底补挑）');
            touched++;
        }
        if (touched) touchedAny = true;   // ★A-3b：留给收尾复核判断"这一趟到底动过没有"
        if (!touched) break;              // 这一轮没有不达标的 → 收敛，收工
        }
        /* ★A-3b 收尾复核（只在"这一趟真的动过东西"时跑一次）：
           上面每一轮都是"**量底 → 预测着解 → 写**"；而有些元素的底**跟着自己的字色走**
           （`.ywpu-fbtn`：`background: color-mix(in srgb, currentColor 26%, transparent)`），
           预测式解色在这种元素上会**来回翻**：写黑 → 底跟着变黑 → 下一轮按新底又觉得"白好" → 写白 → 底变亮 → …
           最后一轮停在哪一端全看奇偶（实测高饱和蓝底的「全部 160」停在黑，只有 1.98，而白其实有 4.17）。
           这一遍**不看任何预测**：谁按当前真实渲染还不够，就把两端各写一次、各量一次，留**实际更好**的那一端。
           （`st.els` 里记的所有元素都是"我们动过色的"，没有不达标就一个都不碰 —— 正常主题这一遍等于一次遍历。） */
        if (touchedAny) {
            let settle = 0;
            for (let pass = 0; pass < 2; pass++) {
                let n = 0;
                for (const el of root.querySelectorAll('*')) {
                    if (el === probe || el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
                    if (el.closest(INK_SKIP) || el.closest(INK_FOLLOW_TOKEN)) continue;
                    let hasText = false;
                    for (const n2 of el.childNodes) if (n2.nodeType === 3 && n2.nodeValue && n2.nodeValue.trim()) { hasText = true; break; }
                    if (!hasText) continue;
                    const rc = el.getBoundingClientRect();
                    if (rc.height <= 0 || rc.width <= 0) continue;
                    const cs = getComputedStyle(el);
                    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
                    const c = inkParse(cs.color);
                    if (!c) continue;
                    const op = +(parseFloat(cs.opacity) || 1);
                    if (c.a * op < 0.02) continue;
                    const dimEl = el.closest(INK_DECOR_DIM);
                    const dimmed = !!dimEl && (+(parseFloat(getComputedStyle(dimEl).opacity) || 1)) < 0.999;
                    const need = (el.closest(INK_DECOR_ALWAYS) || el.disabled || (el.getAttribute && el.getAttribute('disabled') != null)) ? 3.0
                        : (dimmed ? 3.0 : 4.5);
                    const bgN = bgOf(el, true);
                    const ct = inkRatio(inkOver({ r: c.r, g: c.g, b: c.b, a: 1 }, Math.max(0.001, c.a * op), bgN), bgN);
                    if (ct >= need) continue;
                    inkEndByMeasure(el); n++;
                }
                settle += n;
                if (!n) break;
            }
            if (settle) log.push('收尾复核：' + settle + ' 处按**实际渲染**重新挑端');
        }
        probe.remove();
        inkNoTransition(false);           // ★A-3：算完就恢复（这条面板的过渡照旧）
        const line = log.length ? '[预设更新器] 自动取色（R7）：' + log.join('；') : '';
        if (line && line !== _inkLog) { _inkLog = line; console.log(line); }
        if (!line) _inkLog = '';
    } catch (e) {
        inkNoTransition(false);           // ★A-3：出异常也要恢复（绝不把"关过渡"留在页面上）
        console.warn('[预设更新器] 自动取色算不出来（照主题原色显示，不影响功能）', e);
    }
}
function applyAutoInkAll() { for (const sel of INK_ROOTS) { const el = $el(sel); if (el) applyAutoInk(el); } }

/* ★A-2（wave4 · 2026-09-26）：**换主题要当场重算**。
   验收实测（`独立验收与全量回归-夜间.md` §2.2）：窗口开着换主题 → 第一眼看到 1.07~2.18 的近乎不可见文字，
   **等 3 秒不会自愈**（读数甚至更低），必须等用户下一次点界面触发重绘才恢复。
   根因：`applyAutoInk` 只在 `renderAll()` 里被调（`renderHead/View/Foot` 之后），
   而 ST 换主题只改 `document.documentElement` 上的 `--SmartTheme*` 变量、**不经过我们的 render** ⇒
   上一个主题算出来的内联令牌一直挂着，没人去重算（`key` 里虽然有主题变量，但没人叫它跑）。
   ⇒ 接**既有的**重绘入口（`applyAutoInkAll()`，一个字不新造）到"主题变量变了"这件事上：
     · 挂在 `document.documentElement` 的 `style` 属性上（`applyThemeColor()` 就是往它上面 setProperty 的，
       `script.js`/`power-user.js:1104-1151`；`#themes` 下拉、逐项取色、预设应用三条路都会走到它）；
     · MutationObserver 的回调是**微任务** ⇒ 在浏览器画下一帧**之前**就把颜色算好了
       （用户不会看到"先闪一下错色再变"；实测①换完立刻量 = 全达标）；
     · 只有真的动过 documentElement 的 style 才触发，且 `applyAutoInk` 自己有 key 缓存 ⇒ 没变就是零开销。
   ★没新造第二套机制：回调里调的就是 `applyAutoInkAll()`（与 renderAll 末尾同一个入口）。 */
let _themeWatched = false;
function watchThemeChange() {
    if (_themeWatched) return false;
    try {
        const de = document.documentElement;
        if (!de || typeof MutationObserver !== 'function') return false;
        new MutationObserver(() => {
            try { applyAutoInkAll(); } catch (e) { /* 算不出来就照主题原色显示，不影响功能 */ }
        }).observe(de, { attributes: true, attributeFilter: ['style'] });
        _themeWatched = true;
    } catch (e) { /* 挂不上就退回老行为（下次 render 时重算），不报错、不影响任何功能 */ }
    return _themeWatched;
}

/** 把用户选的颜色写到各个容器的 CSS 变量上（不选就用内置默认值）
 *  ★新开的窗口也要在这里列上，否则那个窗口用的是 CSS 里的默认色（v3.8-3 的 BUG 就是这么来的） */
function applyColors() {
    const cs = getSettings().colors || {};
    for (const sel of ['#ywpu-card', '#ywpu-root', '#ywpu-sheet', '#ywpu-cmp', '#ywpu-patch']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        for (const [k, , varName] of COLOR_DEFS) {
            const v = cs[k];
            if (v) el.style.setProperty(varName, v); else el.style.removeProperty(varName);
        }
    }
}

// ---------------------------------------------------------------- 摘要 / 工具条

/** ★所有「弹出的界面」的关法统一成**只有它自己的按钮**（作者要求："所有弹出的界面都必须手点 ✕ 才关"）。
 *
 *  我们的四个浮层（`#ywpu-root` 对比页 / `#ywpu-cmp` 顺序对照 / `#ywpu-sheet` 条目面板 / `#ywpu-patch` 补丁确认页）
 *  **故意挂在 `document.body` 上**（抽屉祖先带 transform，画在抽屉里会被滚跑 —— §17.5），于是有两层"点外面就没"：
 *   ① 我们自己写的：遮罩点击 = 关（`e.target === host`）→ 删掉；
 *      `document` 级 Esc = 关 → 删掉（三个窗口各一处，见 §23）。
 *   ② **ST 那一层**（这一层用户感受最强）：`public/script.js:12154` 的
 *      `$('html').on('touchstart mousedown', …)`（判定在 12176-12188，原注释
 *      "This autocloses open drawers that are not pinned if a click happens inside the app which does not target them."）
 *      只要按下/点击的落点**不在任何 `.openDrawer` 里面**，就把打开的抽屉全部收起来。
 *      我们的浮层不在抽屉里 → **点浮层里的任何地方**（连点正文、点 ✕ 都算）都会被 ST 当成"点抽屉外面"
 *      → 扩展面板整块收起，用户得重新点扩展图标才能看见插件（实测：`e2e/tmp/close-before.json` 的
 *      "点 ✕ → 扩展抽屉开 false"）。ST 还有"按 Esc 收起抽屉"，浮层开着时按 Esc 同样把页面收走。
 *  ⇒ 在宿主上把这几个事件**就地 `stopPropagation`**（不阻断同一元素上的其它监听 → 浮层自己的点击/
 *    真鼠标手势/拖动全不受影响；`mouseup/mousemove` 不动，因为拖动手势要它们）。
 *  ★跟商店那边（`preset-store.js` 的 `#yws-dlg-host`）是同一套修法，两个模块各自独立（发布隔离）。 */
function guardOverlay(host) {
    if (!host) return;
    for (const evName of ['mousedown', 'touchstart', 'click', 'keydown', 'keyup']) {
        host.addEventListener(evName, (ev) => ev.stopPropagation());
    }
    installEscShield();
}

/** 我们的四个浮层里，有任何一个开着吗？ */
const anyOverlayOpen = () => ['#ywpu-root', '#ywpu-cmp', '#ywpu-sheet', '#ywpu-patch']
    .some(sel => { const e = document.querySelector(sel); return !!(e && e.classList.contains('ywpu-open')); });

let _escShield = false;
/** ★Esc 在我们浮层开着时**什么都不做**（作者："所有弹出的界面都必须手点 ✕ 才关"）。
 *  只拦 `Escape` 一个键、只在有浮层开着时拦，而且是在**捕获阶段**拦 —— ST 那条
 *  `$('html').on('touchstart mousedown')` 里夹带的"按 Esc 收起设置抽屉"（script.js:12154 那一段附近）
 *  是 html 上的冒泡监听，捕获阶段停住它就收不到 → 页面不会被 Esc 收走。
 *  （宿主上的 `keydown` 拦截只在"焦点正好在浮层里"时生效；焦点在 body 上时得靠这一层。） */
function installEscShield() {
    if (_escShield) return;
    _escShield = true;
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape' || !anyOverlayOpen()) return;
        ev.stopPropagation();
    }, true);
}

/** ★W100-丙（作者原话）：**一个条目可能同时改了三样**（内容 / 名字 / 开关）——
 *  原来只挂一枚徽标的位置，现在**每个维度各挂一枚**（"改了内容 · 改了名字 · 改了开关"逐枚都在）。
 *  用词统一（作者点名）：两边不同 ⇒ **改了内容**；开关不同 ⇒ **改了开关**；改名照旧「改了名字」。
 *  判据全部读内核产物（status / renamed / enabledDiff），不自己发明一套；
 *  顺序 = **名字 → 内容 → 开关**（★W108 按 R22 ①-2 裁定改成"与图例/筛选同序"——
 *  同一维度全站一个次序；原"内容→名字"那个顺序作废，连带测试台的按字断言同步）。 */
function statusLabels(it) {
    const S2 = PM.STATUS;
    const MERGE = [S2.AUTHOR_ONLY_CHANGED, S2.MINE_ONLY_CHANGED, S2.BOTH_CHANGED, S2.MINE_ONLY_CHANGED_2WAY];
    const out = [];
    if (!it) return out;
    if (!it.mine || !it.next) {
        out.push(it.status === S2.ONLY_NEXT ? { text: '新版新增', cls: 'ywpu-st-onlyNext' } : { text: '只有我有', cls: 'ywpu-st-onlyMine' });
        return out;
    }
    /* ★W108-①-2：推入序 = 名字 → 内容 → 开关（与图例/筛选同序；R22 裁定） */
    if (it.renamed) out.push({ text: '改了名字', cls: 'ywpu-st-renamed' });
    if (MERGE.indexOf(it.status) >= 0) out.push({ text: '改了内容', cls: 'ywpu-st-both' });
    if (it.enabledDiff) out.push({ text: '改了开关', cls: 'ywpu-st-switch' });
    if (!out.length) out.push({ text: '两边一样', cls: 'ywpu-st-same' });
    return out;
}
/** 兼容壳：`badge` / `cls` = **第一枚**徽标（顺序页与条目面板那两处照旧只挂一枚 ——
 *  那两处的状态列是固定宽度的三列版式，多挂会把版式挤歪）；`badges` = 全部（条目行逐枚画）。 */
function statusMeta(it) {
    const badges = statusLabels(it);
    const first = badges[0] || { text: '两边一样', cls: 'ywpu-st-same' };
    return { badges, badge: first.text, cls: first.cls, why: PM.STATUS_LABEL[it && it.status] || '' };
}

/* ★W14 ⑤（作者第 23 批原话："『用新版/用旧版』后面还跟着一个虚线画的框，里面还有『用新版』…
   虚线框和里面的内容可以删掉（下面已经有『用我的/保存为两版/用新版』，而且选过的那项已经有底色，
   用户看得出选的是哪个）"）⇒ **`pickPill()` 整颗退役**（函数体 + 两个渲染点 + CSS 的
   `.ywpu-pickpill`/`.ywpu-pick-*` 一并删掉，不留死代码）。回滚法：从本批 patch 脚本里反向恢复
   （git 有历史；`e2e/tmp/w14-snap-before.js` 是本轮开工时的快照）。
   ★取证（不是随手删的）：全库 grep「虚线框」只有三处候选 —— `.ywpu-pickpill`（紧跟「已选择」徽标、
   内容就是 用我的/用新版/保存为两版/保留/不要/加进来）、`.ywpu-alt-chip`（逐处挑里的"另一版"小字）、
   `.ywpu-backbtn`（返回按钮）；只有第一处的文案与作者描述**逐字对得上**（"下面已经有『用我的/保存为两版/用新版』"），
   另两处都不是"用新版"三个字。 */

/** ★M24（作者第三批："填了官方旧版 → 判断谁改的"这个功能现在好不好用？）——
 *  现状：判断结论**只在徽标的悬浮说明（title）里**（`statusMeta().why`），正文里看不到；
 *  底栏那颗胶囊只回答"这次到底能不能判"（三方对比 / 两方对比），不回答"这一条是谁改的"。
 *  → 作者要的是"不影响别的、只给用户更多信息帮他判断"，所以这里补一枚**只在展开区出现**的小字条：
 *    **只有真的三方对比（填了 ③ 官方旧版 = S.analysis.stats.threeWay）时才有内容**，
 *    两方对比时返回空串 —— 一个字节都不多画（老界面/老断言零影响）。
 *  用 `PM.STATUS_LABEL` 的原话，不另编：作者改过（你没动它）/ 只有你改过（作者没动它）/ 你和作者都改过。 */
function whoPillHtml(it) {
    try {
        /* ★Wave B2：**带锁** —— 只有"基准对得上（状态①）"才点亮（`lockLitNow()` 一个判据说了算：
           卡/包声明的基准版本 === 认出的赢家）。总开关 `settings.baseLock=false` 时它退回旧口径
           （三方对比就点亮）—— 那正是本波"假证性"的正向对照。 */
        if (!lockLitNow() || !it) return '';
        const why = PM.STATUS_LABEL[it.status] || '';
        if (!why) return '';
        // 只给"双方正文不同"这几种加；"两边一样"之类不用标（标了反而是噪音）
        if (it.status === PM.STATUS.SAME) return '';
        return `<span class="ywpu-chip ywpu-whopill ywpu-st-${esc(String(it.status))}" title="填了③官方旧版才判得出来（三方对比）；这条的判据：${esc(why)}">谁改的：${esc(why)}</span>`;
    } catch (e) { return ''; }
}

/** 结果区的四个固定容器：万一被清掉就重建（避免"清空父节点把子容器一起删掉"这类自伤） */
const RESULT_SLOTS = ['#ywpu-summary', '#ywpu-toolbar', '#ywpu-list', '#ywpu-params'];
function ensureResultSkeleton() {
    const host = $el('#ywpu-view-items');
    if (!host) return null;
    if (!$el('#ywpu-summary')) {
        /* ★W103-戊/庚：结构变了两处（**只为把"操作 + 筛选 + 工具条"整块吸顶**）：
           · 工具条（#ywpu-toolbar）**不再**是这一列的兄弟节点 —— 它由 `renderResult()` 画进
             `#ywpu-summary` 里的 `#ywpu-controls`（那个才是吸顶块；`#ywpu-summary` 自己改成
             `display:contents` ⇒ 它的孩子按 DOM 顺序参与本列排版，吸顶块能横跨整列）。
             这样 `#ywpu-summary .ywpu-fbtn` 这类**老套件的选择器一个字都不用改**（DOM 仍在其内）。
           · 判定"骨架在不在"仍只看 `#ywpu-summary`（照旧）。 */
        host.innerHTML = '<div id="ywpu-summary"></div><div id="ywpu-list"></div><div id="ywpu-params"></div>';
    }
    return host;
}

/* ==== ywpu-filters-core:start（条目区那一排 / 正则块那一排 **共用** 的一整套筛选与两颗"一键"）
   ★Wave W2 ①（2026-09-24 · 作者第 20 批原话："你就不能像前边的那个条目一样，就在那个地方放好
   一键选旧版 一键选新版 全部 待我处理 新版新增 只有我有 两边不同 开关不同 这种吗？
   就是直接把它 copy 下来不就好了吗，它的逻辑呀，全部逻辑 copy 下来"）
   ⇒ 本节就是那"一份逻辑"：**筛选定义（标签/顺序/配色）、判定函数、chips 渲染、两颗一键的渲染**
   全在这里，两处都调它 —— 不新造第二套视觉、不新造第二套语义。
   ★为什么单起一对标记：`ywpu-regex-core` 那一段会被 `e2e/probe-regex-core.js` 抽出来**单独编译**
   （那一段只吃参数、不读外面）⇒ 正则块那边**不能**直接引用本节，它的调用方得把本节这几件
   **当参数喂进去**（见 `renderRegexBox()` 里的 `REGEX_FILTER_UI`）。==== */

/** 顶部标签：点一下只看这一类；再点一次 = 取消回"全部"。全部在最左，默认不做任何筛选。
 *  v3.8：标签跟着"合并后的 6 种状态"走（作者改过/你改过/双方都改 并成一个「两边不一样」）
 *  ★Wave W2 ①：「待我处理」这一条按作者第 20 批原话改名（**改前叫「点我处理」**）——
 *    条目区与正则块用的是**同一个数组**，所以两排的标签、顺序、配色永远一致（作者要的"照抄"就是这个意思）。 */
const FILTERS = [
    { id: 'all', label: '全部', cat: 'all' },
    { id: 'pending', label: '待我处理', cat: 'warn' },
    { id: 'add', label: '新版新增', cat: 'new' },
    { id: 'mineOnly', label: '只有我有', cat: 'old' },
    { id: 'renamed', label: '改了名字', cat: 'renamed' },
    { id: 'both', label: '改了内容', cat: 'both' },
    { id: 'switch', label: '改了开关', cat: 'switch' },
    { id: 'empty', label: '空条目', cat: 'same' },
];

/** 筛选判定的**唯一实现**（条目区与正则块共用）。两边的差异只有两处，用 `rx` 说明：
 *  · `pending` —— 条目侧 = 内核 `needsChoice && !itemDecided`（"还没选"）；正则侧 = 内核 `regexNeedsChoice`
 *    且**你没亲手点过这一行**（`state.regexTouched`）。为什么正则不能照抄"还没选"：正则的决策表一进页面
 *    就被内核兜底值**预填了**（`fallbackRegexDecision` 一定给 `use`）⇒ 用 `regexItemDecided` 数出来恒为 0
 *    （Wave G ④ 实测过的"死文案"）。
 *  · `switch` —— 条目侧那维叫 `enabledDiff`、正则侧叫 `disabledDiff`（同名不同键，内核产物就是这么给的）。
 *  其余各档**逐字同源**：`add`/`mineOnly`/`renamed`/`both` 读的内核 `STATUS` 键两边一模一样；
 *  `empty` 在正则条目上天然为假 ⇒ 那颗 chip 在正则那排自动不出现（0 计数的 chip 本来就不画）。
 *  @param {object} it   条目 / 正则条目（都是内核产物）
 *  @param {string} id   `FILTERS` 里的 id
 *  @param {object} PMx  内核（两条路都是同一个真内核）
 *  @param {object|null} [rx]  正则侧适配器 `{ pending(it) }`（不传 = 条目侧口径） */
function matchFilter(it, id, PMx, rx) {
    const M = (PMx && PMx.STATUS) ? PMx.STATUS : (PM.STATUS || {});
    switch (id) {
        case 'pending': return rx ? !!rx.pending(it) : isPending(it);
        case 'add': return it.status === M.ONLY_NEXT;
        case 'mineOnly': return it.status === M.ONLY_MINE;
        case 'renamed': return !!it.renamed;
        case 'both':
            return it.status === M.BOTH_CHANGED || it.status === M.MINE_ONLY_CHANGED_2WAY
                || it.status === M.AUTHOR_ONLY_CHANGED || it.status === M.MINE_ONLY_CHANGED;
        case 'switch': return rx ? !!it.disabledDiff : !!it.enabledDiff;
        case 'empty': return !!(it.mineEmpty || it.nextEmpty);
        default: return true;
    }
}

/** 每类有几条（"全部"= 总数；0 条的那些 chip 不画 —— 与改前的条目区口径一致）。
 *  @param {Array} items 内核产物（条目 / 正则条目）
 *  @param {object} PMx  内核
 *  @param {object|null} [rx] 正则侧适配器（见 `matchFilter`） */
function filterCountsOf(items, PMx, rx) {
    const arr = Array.isArray(items) ? items : [];
    const out = { all: arr.length };
    for (const f of FILTERS) { if (f.id === 'all') continue; out[f.id] = arr.filter(it => matchFilter(it, f.id, PMx, rx)).length; }
    return out;
}

/** 筛选那一排 chips 的**唯一渲染**（两处共用：同款 `.ywpu-chip .ywpu-fbtn .ywpu-f-<cat>`、
 *  同款"点自己 = 取消"高亮类 `ywpu-on`、"0 条的不画"同一条规矩）。
 *  @param {object} counts `filterCountsOf()` 的产物
 *  @param {string} active 当前选中的 id（'all' / 'pending' / …）
 *  @param {string} attr   点击锚点属性名（★W107 起产品里只有一处调用：顶部那排 = `data-filter` —— 它现在两摊一起筛；
 *                         正则块当年那排 `data-rxfilter` 已随外框删除，`regexFilterUI().chips` 只是给老探针留的口子）
 *  @param {boolean} [allOn] ★★W110-A：那颗「全部」的高亮**由状态派生**（`allScopeShown()` —— 两摊都开 + 行筛选清空），
 *                         不再只看 `active === 'all'`（它现在是主开关，高亮 = "全都摊着看"）。不传 ⇒ 老口径（active==='all'）。 */
function filterChipsHtml(counts, active, attr, allOn) {
    const c = counts || {};
    /* ★★W103-甲（作者原话："关于最上面的 当前：全部 这个说明删掉"）：
       改前最左那颗明写的「当前：X」（`.ywpu-nowfilter`）**整颗删掉** —— 点一下就能看见当前档。
       ★配套（作者同批第 3 条原话："每个框的大小就算选了它，它的大小也不要变化 ——
       不然每次选择之后所有位置都会微妙的变化，这样不好"）：
       选中态现在**只靠那颗按钮自己**表达，而且**一个像素都不许动** ——
         · 保留：内描边（box-shadow inset，不进布局）+ 底色 26%；
         · 删掉：字重 700（粗体会把文字撑宽 1~3px ⇒ 后面的框全体右移 —— 就是作者说的"微妙的变化"）；
         · ✓ 改成**绝对定位的角标**（`::after` + position:absolute，不进排版流），见 CSS 的 .ywpu-fbtn.ywpu-on。
       ⇒ 点前 / 点后同一颗按钮（以及它后面每一颗）的 getBoundingClientRect() **逐项相同**（W103 探针钉着这条）。
       ▲判据锚点：产品 HTML 里 `.ywpu-nowfilter` **0 命中**（W103 探针按它取数）。 */
    return FILTERS.map(f => {
        const n = (f.id === 'all') ? (c.all || 0) : (c[f.id] || 0);
        if (!n && f.id !== 'all') return '';
        /* ★★W110-A：「全部」那颗的亮灭**由状态派生**（allScopeShown()）—— 它是主开关，不再跟别的 chips 同一路。 */
        const lit = (f.id === 'all') ? (allOn === undefined ? (active === 'all') : !!allOn) : (active === f.id);
        const on = lit ? ' ywpu-on' : '';                    // 默认/选中那颗自己亮着
        return `<button class="ywpu-chip ywpu-fbtn ywpu-f-${f.cat}${on}" ${attr}="${f.id}">${f.label} <b>${n}</b></button>`;
    }).filter(Boolean).join('');
}

/* ★★W103-丁（作者 2026-10-06 原话）："额外做多两个筛选，这两个筛选可以和前面的内容共存 ——
   就是 预设条目 / 正则条目：如果点击的是整份，那么默认两个都勾选；如果是部分预设条目、正则没有变化，
   那么就默认勾选预设条目；如果是只有正则，那么同理。注意这个筛选是可以再次点击就是取消筛选。"
   —— 这两颗 = **两块内容各自的显隐开关**（点一次收起、再点一次放回来，可反复），
      与既有那排 chips **互不覆盖**：它们读写 `S.scopeItems / S.scopeRx`，既有 chips 读写 `S.filter`（两条路）。
      语义上"看哪一块"在前、"这一块里看哪些"在后 ⇒ 渲染位置放在那排 chips **最前面**（ops 之后）。 */
/** 两颗范围开关的**唯一渲染**（条目区那一排调它；正则块那排不画 —— 它管的是"整块在不在"）。
 *  ★W107-②c（作者原话："两颗范围开关后面各跟数字"）：各带一枚计数 —— 预设条目 = 条目数 N、正则条目 = 正则数 M
 *  （写法与筛选 chips 的 `<b>` 同款，复用既有视觉语言）；顶部那排筛选里的「全部」= **N + M**（两摊并集，见 filterCountsOfBoth）。 */
function scopeChipsHtml(onItems, onRx, nItems, nRx) {
    const N = Number(nItems) || 0, M = Number(nRx) || 0;
    const one = (id, label, on, tip, n) => `<button class="ywpu-chip ywpu-fbtn ywpu-scope${on ? ' ywpu-on' : ''}" data-scope="${id}"`
        + ` title="${tip}">${label} <b>${n}</b></button>`;
    return one('items', '预设条目', onItems !== false,
        '看 / 不看「预设条目」这一块（再点一次 = 收起来 / 放回来）。它跟后面的筛选一起用：这两颗挑"看哪一块"，后面那排挑"这一块里看哪些"。', N)
        + one('rx', '正则条目', onRx !== false,
            '看 / 不看「正则条目」这一块（再点一次 = 收起来 / 放回来）。', M);
}

/** ★W104-乙（作者 2026-10-06 原话："为什么预设条目一按就出来，正则条目按一次只出了这种：
 *   `正则39 条·内容不同10·只有我有5·新版新增2` —— 然后还要再往这个上面再点一次……不要进行二次点击。"）：
 *  **点「正则条目」= 按一次必达可见**。三条口径（W104 报告里有状态表）：
 *    · 关着（整块收成一条 `▸ 正则条目 N 条`）⇒ **开 + 展开**（正则行当场画出来）；
 *    · 开着但块是收起的（只露一条 `▸ 正则 N 条…` 标题条）⇒ **展开**（按一次照样直接见到条目）；
 *    · 开着且已展开 ⇒ **取消**（整块收成 `▸ 正则条目 N 条` —— 与「预设条目」那颗同一个"再点 = 取消"口径）。
 *  为什么第 2 条不是"直接取消"：作者这次的诉求是"按一次就要看到内容"；开着却没展开时按它本意就是"我要看"，
 *  直接取消会让"按了反而更看不见"（改前就是这个毛病）。取消 = 展开态下再点一次，语义清楚。
 *  @returns {boolean} true = 这一次是"要看到内容"（调用方据此把块滚进视野） */
function rxScopePress() {
    /* ★W107-②：内层折叠已删（外框统一）⇒ 只剩**开 / 关**两态，键也只剩 `S.scopeRx` 一个。
       W104-乙"按一次必达可见"照旧成立：关着时按一次 = 当场看见正则行（下面直接就是行、没有中间条），
       开着时按一次 = 收起（= 作者定的"再点一次 = 取消筛选"口径，一个字没变）。 */
    const on = (S.scopeRx === false);
    S.scopeRx = on;
    return on;
}

/** ★★W110-A（作者 2026-10-07 凌晨原话）："点击全部 它会默认帮我选择预设条目和正则条目 然后再点击一次全部的话
 *  它会帮我取消掉前面两个条目 这个逻辑应该是对的吧" —— 「全部」升格成**主开关**（协调方已复作者，照做）：
 *   · 点一下 = `scopeItems = true` **且** `scopeRx = true` **且** `filter = 'all'`（两摊都摊开 + 行筛选清回全看）；
 *   · 再点一下 = `scopeItems = false` 且 `scopeRx = false`（两摊都收成折叠条）——filter 不动（收起态下它也该留着）；
 *   · 它的**亮灭由状态派生**（本函数），不引入隐藏状态；行筛选 chips 照旧"单选、点自己取消"；
 *   · **不把「全部」和「待我处理」绑成一颗**（一个是"显示哪几摊"、一个是"只看哪些行"）。
 *  @returns {boolean} 现在是不是"两摊都摊着 + 行筛选全看"（= 「全部」那颗该亮着） */
function allScopeShown() {
    return (S.scopeItems !== false && S.scopeRx !== false && S.filter === 'all');
}

/** ★★W110-B（作者原话）："点击预设条目 它是展开……再点击一次预设条目 它就会缩成一个折叠的……
 *  但是我展开了之后 我没有办法再点击那个折叠条帮它缩起来 因为那个折叠条消失了……但是这时候我点正则条目
 *  它却没有这个折叠条 你要做一个和那个预设条目一模一样的折叠条……**这两个折叠条是永远不消失的**
 *  我可以随时点击这两个折叠条把它展开收起……都是一个折叠条是预设条目多少条 需要你选多少条……
 *  样式是一样的"。
 *  ⇒ 条目侧 / 正则侧**各一根常驻条**（同一套 `.ywpu-rxbar.ywpu-scopebar` 视觉，写死同一句式样）：
 *    · 收起态 = 这一摊**只有这一根条**；展开态 = 这根条当**列表头**，下面直接就是行；
 *    · 点条 = 收起 / 展开这一摊 —— 与顶部对应那颗范围开关**同一个状态键**（`scopeToggle()` 一条路），双向同步；
 *    · 文案逐字：`预设条目 N 条 · 需要你选 M 条` / `正则条目 N 条 · 需要你选 M 条`
 *      （N = 该摊总条数；M = 该摊**待处理数** = 内核口径"还要你选"的那些 —— 与筛选那排「待我处理」同一个判据）。
 *  ★与 W107 的口径一致：**不加回任何工具栏 / 计数行** —— 这根条里只有一个 caret + 一句文案（没有一键四颗、
 *    没有第二排筛选、没有别的东西）；W107 删掉的那一整条 `.ywpu-rxbar` 工具栏形态不许回来。 */
function scopeBarHtml(kind, n, need, on) {
    const label = (kind === 'items') ? '预设条目' : '正则条目';
    const id = 'ywpu-scope-' + kind + (on ? '-head' : '-back');
    const tip = (kind === 'items')
        ? '点一下 = 收起「预设条目」这一摊（收起来还点这里放回来）；和上面那颗「预设条目」开关是同一个键。'
        : '点一下 = 收起「正则条目」这一摊（收起来还点这里放回来）；和上面那颗「正则条目」开关是同一个键。';
    const N = Math.max(0, Number(n) || 0), M = Math.max(0, Number(need) || 0);
    return '<div class="ywpu-rxbar ywpu-scopebar"><button class="ywpu-btn ywpu-mini" id="' + id + '" title="' + tip + '">'
        + (on ? '▾' : '▸') + ' ' + label + ' ' + N + ' 条 · 需要你选 ' + M + ' 条</button></div>';
}

/** ★W110-B：把这一摊常驻条的点击接上（条每次重绘都是新节点 ⇒ 每次都重新绑）。
 *  点条 = 与顶部那颗范围开关**同一支** `scopeToggle()`（同一个状态键、同一套重绘）—— 双向同步，
 *  不存在"条和开关各记一份"的第二状态。 */
function bindScopeBar(host, kind) {
    if (!host) return;
    const b = host.querySelector('#ywpu-scope-' + kind + '-head, #ywpu-scope-' + kind + '-back');
    if (b) b.addEventListener('click', () => { scopeToggle(kind); renderResult(); renderFoot(); });
}

/** ★W110-A/B：两颗范围开关的**唯一状态翻转**（顶部 chip 与那根常驻条都走这里 —— 一处状态、两条入口）。 */
function scopeToggle(kind) {
    if (kind === 'items') { S.scopeItems = (S.scopeItems === false); return S.scopeItems; }
    return rxScopePress();
}

/** ★W110-B：这一摊"还要你选"几条（= 顶部筛选那排「待我处理」的计数口径，两摊各一份）。
 *  条目侧 = `S.filter` 那套同一支 `matchFilter(..., 'pending')`；正则侧 = `regexFilterUI().rx.pending`。 */
function scopeNeedCount(kind) {
    try {
        if (kind === 'items') {
            return (S.analysis && Array.isArray(S.analysis.items) ? S.analysis.items : []).filter(it => matchFilter(it, 'pending', PM)).length;
        }
        return (Array.isArray(S.regexItems) ? S.regexItems : []).filter(it => matchFilter(it, 'pending', PM, regexFilterUI().rx)).length;
    } catch (e) { return 0; }
}

/** ★W104-乙：正则块在条目列表**下面**（长列表时常常在几屏之外）—— 点了「正则条目」如果它不在视野里，
 *  就把它滚到看得见（对齐到吸顶块 `#ywpu-controls` 下沿再留 8px，别被吸顶块盖住）。
 *  **已经看得见 ⇒ 一个像素都不动**（不许乱跳滚动条）。 */
function rxRevealIntoView() {
    requestAnimationFrame(() => {
        const host = $el('#ywpu-rx-host'), body = $el('#ywpu-body');
        if (!host || !body) return;
        const ctrl = $el('#ywpu-controls');
        const b = body.getBoundingClientRect(), h = host.getBoundingClientRect();
        const top = ctrl ? ctrl.getBoundingClientRect().bottom : b.top;
        if (h.top >= top && h.top <= b.bottom - 40) return;      // 已经看得见 ⇒ 不动
        body.scrollTop = Math.max(0, Math.round(body.scrollTop + (h.top - top) - 8));
    });
}

/** ★W103-丁：那两颗范围开关的**默认值** —— 作者给的三条规则，逐条照做：
 *   · "如果点击的是整份"（商店那张卡是整份预设卡，`pack.kind` 以 preset 开头）⇒ **两个都勾**；
 *   · "部分预设条目、正则没有变化" ⇒ 只勾「预设条目」；
 *   · "只有正则" ⇒ 只勾「正则条目」。
 *  其余两种（两边都有改动 / 两边都没有改动）⇒ 两个都勾（看到的跟改前一样是全的，最不意外）。
 *  ★口径说明（写给接手的人）：更新器自己那条路（①②自己选两份预设）**没有"整份卡"这个概念**，
 *    所以按"哪边真有改动"算 —— 跟作者那三条规则的意图一致（他列举的正是"只有一部分改了"的三种情形）。 */
function defaultScopeOf(an) {
    const M = PM.STATUS || {};
    const items = (an && Array.isArray(an.items)) ? an.items : [];
    const rxs = Array.isArray(S.regexItems) ? S.regexItems : [];
    if (S.store && /preset/i.test(String(S.store.kind || ''))) return { items: true, rx: true };   // 整份 ⇒ 两个都勾
    const itemsChanged = items.some(it => it && it.status && it.status !== M.SAME);
    const rxChanged = rxs.some(it => it && it.status !== M.SAME);
    if (rxChanged && !itemsChanged) return { items: false, rx: true };     // 只有正则
    if (itemsChanged && !rxChanged) return { items: true, rx: false };     // 只有条目（正则没有变化）
    return { items: true, rx: true };
}

/** 两颗"一键"按钮的**唯一渲染**（两处共用：同款 `.ywpu-btn.ywpu-mini` + `ywpu-sel` 高亮 + 同一个"再点一次 =
 *  取消全选"口径）—— 只有 id 与 title 里那句"范围说明"按所在那排不同（条目 / 正则）。
 *  @param {'mine'|'next'|null} active 现在生效的是哪一颗
 *  @param {string} idMine/idNext     两颗的 id
 *  @param {string} tipMine/tipNext   两颗的 title（各自那排的"范围说明"） */
function bulkBtnsHtml(active, idMine, idNext, tipMine, tipNext, mo) {
    /* ★W14 ②③：**「保留只有我有」/「丢弃只有我有」**（作者第 23 批点名要的，放「一键选新版」旁边）。
       · 只作用于「只有我有的」，点是/点否与条目行里那对 `保留 / 不要` 一字不差；
       · **再点一次 = 取消**（回到"还没选"）—— 判据就是"现在还亮着吗"（`mo.active === 要点的这一颗`）；
       · `mo` 不传 / `mo.n === 0` ⇒ **一颗都不画**（这个包里没有"只有我有的" ⇒ 点了也是白点，
         而且它们会把这排挤到第二行、伤首屏硬指标 —— 与 Wave G ② 那颗"没有可选项就不画"同一条纪律）。 */
    const btns = `<button class="ywpu-btn ywpu-mini${active === 'mine' ? ' ywpu-sel' : ''}" id="${idMine}" title="${tipMine}">一键选旧版</button>`
        + `<button class="ywpu-btn ywpu-mini${active === 'next' ? ' ywpu-sel' : ''}" id="${idNext}" title="${tipNext}">一键选新版</button>`;
    if (!mo || !mo.n) return btns;
    const moBtn = (mode, label, tip) => `<button class="ywpu-btn ywpu-mini ywpu-mo${mo.active === mode ? ' ywpu-sel' : ''}" id="${mo.ids[mode]}" title="${tip}">${label}</button>`;
    return btns + moBtn('keep', '保留只有我有', mo.tips.keep) + moBtn('drop', '丢弃只有我有', mo.tips.drop);
}
/* ==== ywpu-filters-core:end ==== */

/** 图例里的小色块：点一下就能改这一类的颜色（用户："直接在那个条目状态后面那些色块那里改颜色就好了"） */
function colorInput(k, label) {
    const d = COLOR_DEFS.find(x => x[0] === k) || [];
    const val = (getSettings().colors || {})[k] || d[3] || '#888888';
    return `<label class="ywpu-lgd" title="点色块就能改「${label}」的颜色">`
        + `<input type="color" data-color="${k}" value="${val}"><span>${label}</span></label>`;
}

/** ★W106 ②：图例（条目状态）的 HTML —— 现在挂在**窗口头第 1 行**（标题旁），buildWindow 画一次。
 *  展开层是组件正下方的浮层（CSS 绝对定位）⇒ 点开/收起**原地**、不推挤任何内容（与 W103-庚 的
 *  "展开不推挤"口径一致；作者原话："点击后它的折叠区域还在原地；再点击一次就收起"）。
 *  ★类名与色块数量与搬家前**一个字节没改**（老探针按这些类名取，见三条测试台选择器同步）。 */
function legendHtml() {
    return '<details class="ywpu-fold ywpu-legend-fold">'
        + '<summary><span class="ywpu-lgdots" aria-hidden="true">'
        + '<i class="ywpu-dot ywpu-d-new"></i><i class="ywpu-dot ywpu-d-renamed"></i><i class="ywpu-dot ywpu-d-old"></i><i class="ywpu-dot ywpu-d-both"></i>'
        + '</span>条目状态</summary>'
        + '<div class="ywpu-legend-wrap">'
        + '<div class="ywpu-legend"><span class="ywpu-legend-t">点色块改颜色：</span>'
        + COLOR_DEFS.filter(d => d[2].startsWith('--yst-')).map(d => colorInput(d[0], d[1])).join('')
        + '</div>'
        + '<div class="ywpu-legend"><span class="ywpu-legend-t">正文里的底色：</span>'
        + colorInput('chg', '黄＝改了内容') + colorInput('add', '绿＝新版新增') + colorInput('del', '红＝新版删掉')
        + '<span class="ywpu-lgd-plain">灰掉＝这一处不要</span></div>'
        + '<div class="ywpu-legend"><button class="ywpu-btn ywpu-mini" id="ywpu-colors-reset">恢复默认颜色</button></div>'
        + '</div></details>';
}

/** ★W106 ②：「恢复默认颜色」之后把图例里那些输入框的值刷回默认 ——
 *  图例现在只画一次（buildWindow），不再靠"重画 summary"顺带复位（那一招搬家前才有效）。 */
function syncLegendInputs() {
    const host = $el('#ywpu-head-top');
    if (!host) return;
    const cs = getSettings().colors || {};
    host.querySelectorAll('input[data-color]').forEach(inp => {
        const k = inp.getAttribute('data-color');
        const d = COLOR_DEFS.find(x => x[0] === k) || [];
        inp.value = cs[k] || d[3] || '#888888';
    });
}

// ================================================================ ★§22：来源块 + 「位置待定」（2026-09-21）
//  用户原话（两件事，都是真事）：
//   ① "在最上方应该要显示那个这个条目的……那个备注啊，那个条信息以及这个标题，然后要让用户知道正在缝这个东西……
//      因为有时候有一些作者他备注会教用户怎么怎么缝"
//   ② "他缝进去的地方，他不是我的余温预设，而是他从别的地方下的别人写的预设，完全结构就跟我这个完全不同……
//      就是说检测到……找不到，并非余温，所以可以让用户自己选择缝入的地方，或者说缝进去的时候，
//      它就默认在那个列表里面的最上面，然后用户就可以自己进行一个拖动"
//
//  口径（写死，改这里之前先把《定稿方案》§22 与 §5.2 读一遍）：
//   · **来源块**：商店 / 更新包文件 / 云端更新三条入口**共用同一块**（`sourceBarHtml`）：商店那块显示
//     卡片标题 + 用途备注（why）+ 出处（谁的卡 / 来自哪份预设）；另两条显示各自的说明。
//   · **位置待定** = 内核 `resolveAnchor` 对这条新增条目**整条锚点都找不到**（`conf 0`），
//     或者 id 命中了但那条**不在顺序表里**（`conf 60`）—— 这两种内核都会把它塞到顺序表**末尾**
//     （`report.warnings` 里写着"没找到邻居 → 先放进顺序表最后（你可以拖）"）。
//     实测口径见《e2e/multiselect-matrix-report.md》§0/§2：**找不到 = 末尾 conf 0，绝不会静默丢条目**。
//   · 这一轮把默认落点改成**顺序表最上面**（用户明确要求），并逐条标「位置待定」；用户随时可以
//     手动选「插在哪一条后面」，或者在「✍ 条目详细编辑」/「📋 新预设总览」两个页面里拖动 ——
//     全都落在 `S.orderOverride` 这一条路上（顺序页与写盘用的是**同一个** `PM.buildMerged`，
//     所以"看到的顺序 = 写盘的顺序"）。
//
//  ★下面这一段是**纯函数**（不碰 DOM、不读全局）：被 `ywpu-anchor-core` 那一对标记圈起来，
//    会由 `e2e/tmp/probe-stitch-anchor.js` 按标记抽出来、用 `new Function` **真编译**，
//    在纯 Node 里跑"找不到位置 → 置顶 → 手动指定 → 拖动 → 落盘顺序"这条链（**不开浏览器**）。
/* ==== ywpu-anchor-core:start ==== */

/** 来源块要用的最小转义（这一小段会被单独抽出去编译，所以不能借用外面的 esc） */
function srcEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** 掐长度（同上：自带一份） */
function srcClip(s, n) {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? (t.slice(0, n) + '…') : t;
}

/** 从 `applyPatch` 的报告里挑出**位置待定**的新增条目（= 内核把它塞到顺序表末尾的那几条）。
 *  判据（照内核源码，不许凭印象）——**两条并集**：
 *   ① 内核自己在 `report.warnings` 里写的那句 `「<名字>」没找到邻居 → 先放进顺序表最后（你可以拖）`
 *      （`applyPatch` 的 add 分支 `at < 0` 才会写）—— 这是**权威凭据**，覆盖所有"落到末尾"的情形，
 *      包括"名字/编号命中了、但那一条**不在顺序表里**"（conf 90 / 60 都可能这样）。
 *   ② 兜底：`op === 'add'` 且 `conf === 0`（六级兜底全失败）或 `conf === 60`（id 命中但不在顺序表里）
 *      —— 万一以后内核换了措辞，这两档仍然抓得住（探针里两种都钉了）。
 *  conf 55 / 50 / 75 / 80 / 90 / 100 **且内核没报"没找到邻居"**的 → 不算：那些是"有位置、只是把握不大"。
 *  @returns {Array<{name:string, how:string, conf:number, tail:boolean}>} 按报告顺序 */
function pendingAddsOf(report) {
    const ops = report && Array.isArray(report.ops) ? report.ops : [];
    const warns = report && Array.isArray(report.warnings) ? report.warnings : [];
    const tailOf = (name) => warns.some(w => String(w).indexOf('「' + String(name) + '」没找到邻居') === 0);
    return ops.filter(r => r && r.op === 'add' && (tailOf(r.name) || Number(r.conf) === 0 || Number(r.conf) === 60))
        .map(r => ({ name: String(r.name || ''), how: String(r.how || ''), conf: Number(r.conf), tail: tailOf(r.name) }));
}

/** 把"位置待定"的名字对回到 analyze 的条目上（纯函数：items 与名字归一化函数都从外面传进来）。
 *  ② 里只有新版有的那条（`it.next && !it.mine`）就是内核刚塞进去的新条目 —— 找到它就拿到了 identifier，
 *  顺序页/拖动/写盘全靠这个 identifier。名字对不上（例如用户把它改名了）→ ident 留空，
 *  界面照旧显示"位置待定"，只是没有可拖的那一行（**不静默丢**）。
 *  @param {Array<{name:string}>} list  pendingAddsOf() 的结果
 *  @param {Array} items                analyze() 的 items
 *  @param {(s:string)=>string} norm    名字归一化（产品传 PM.normalizeName）
 *  @returns {Array<{name:string, how:string, conf:number, ident:string, key:string}>} */
function pendingIdentOf(list, items, norm) {
    const arr = Array.isArray(list) ? list : [];
    const its = Array.isArray(items) ? items : [];
    const nf = typeof norm === 'function' ? norm : ((s) => String(s || '').trim());
    const out = [];
    for (const x of arr) {
        const nm = nf(x && x.name);
        const it = nm ? its.find(v => v && v.next && !v.mine && nf(v.next.name) === nm) : null;
        out.push({
            name: String((x && x.name) || ''), how: String((x && x.how) || ''), conf: Number(x && x.conf),
            ident: it ? String(it.next.identifier) : '', key: it ? String(it.key || '') : '',
        });
    }
    return out;
}

/** 把 `pinned` 里的 id **整体挪到最前面**（保持它们彼此原来的相对次序）。
 *  @param {string[]} ids 当前顺序
 *  @param {Set<string>|string[]} pinned 要置顶的 id
 *  @returns {string[]} 新顺序（一个都没命中时原样返回一份拷贝） */
function pinFirst(ids, pinned) {
    const list = (Array.isArray(ids) ? ids : []).map(String);
    const set = pinned instanceof Set ? new Set([...pinned].map(String)) : new Set((pinned || []).map(String));
    const head = list.filter(id => set.has(id));
    if (!head.length) return list;
    const tail = list.filter(id => !set.has(id));
    return [...head, ...tail];
}

/** 把 `moving` 里的那几条**挪到 `target` 后面**（`target` 为空 = 挪到最前面）；其余条目的相对次序不动。
 *  用户"手动指定插在哪一条后面"和"拖到某条下面"**都走它**（同一套排序口径，不另写一套）。
 *  @returns {string[]} 新顺序 */
function moveAfter(ids, moving, target) {
    const list = (Array.isArray(ids) ? ids : []).map(String);
    const mv = (Array.isArray(moving) ? moving : [moving]).map(String).filter(Boolean);
    const mvSet = new Set(mv);
    const rest = list.filter(id => !mvSet.has(id));
    const keep = mv.filter(id => list.includes(id));                 // 不在顺序里的直接忽略（绝不凭空变出个幽灵 id）
    if (!keep.length) return list;
    const t = target == null ? '' : String(target);
    if (!t) return [...keep, ...rest];                               // 没有目标 = 放到最上面
    const at = rest.indexOf(t);
    if (at < 0) return [...keep, ...rest];                           // 目标不在顺序里 → 退化成"放最上面"（不静默丢）
    return [...rest.slice(0, at + 1), ...keep, ...rest.slice(at + 1)];
}

/** 来源块的数据模型（三个入口共用）。字段缺了就少写一行，绝不报错。
 *  ★M3（作者第三批）：`line2` 里的**预设名要变色** —— 「缝进〈…〉」「来自预设〈…〉」那两个名字现在只是普通色，
 *    作者"看不出来是哪个预设"。做法：模型额外给一份 `line2Html`（名字包一层 `<span class="ywpu-pname">`），
 *    `srcBarHtml` 优先用它；**纯文本的 `line2` 一个字都不改**（老探针按 `缝进〈…〉` 原文断言，照样过）。
 *  @param {{store?:object, patch?:object, mineName?:string}} o
 *  @returns {{kind:string, title:string, why:string, author:string, official:boolean, line1:string, line2:string, line2Html:string, lines:string[]}} */
function srcModel(o) {
    const it = o || {};
    const mine = String(it.mineName || '你的预设');
    const PN = (s) => '<span class="ywpu-pname">' + srcEsc(String(s)) + '</span>';      // ★M3：预设名的彩色记号
    const fromEsc = (s) => srcEsc(String(s));                                          // ★M3：这一小段要能单独编译，不许借外面的 esc
    const st = it.store || null;
    if (st) {
        const title = String(st.title || '（这张卡没写标题）');
        const why = String(st.why || '');
        const author = String(st.author || '');
        const srcName = String(st.srcPreset || '');
        /* ★★W103-己（作者 2026-10-06 原话）："☁ 来自商店：《…》 · 缝进 X 这个有两个地方有 ⇒
           **保存上面那个**（上面那个做一个展开），**下面的卡片里的可以丢弃**"。
           ⇒ 卡片（这块 `.ywpu-srcbar`）里**不再重复那行标题与"缝进哪一份"**（那两件现在只在窗口头第 2 行，
             见 `renderHead()`）；卡片摘要改画**出处**那一行（谁做的 / 来自哪份），展开里照旧是**用途备注**。
           · 口径：只删"重复的那一行"，卡片能给的其它信息（出处、备注）一个都没丢；
           · `.ywpu-srcbar` / `.ywpu-src-why` 这些类名一个没动（ui-audit 的受检表照旧命中）。 */
        const by = '出处：' + (st.official ? '官方发布' : ('BY ' + (author || '匿名'))) + (srcName ? ' · 来自预设 ' + srcName : '');
        const byHtml = '出处：' + fromEsc(st.official ? '官方发布' : ('BY ' + (author || '匿名'))) + ' · 缝进 ' + PN(mine) + (srcName ? ' · 来自预设 ' + PN(srcName) : '');
        return {
            kind: 'store', title, why, author, official: !!st.official,
            line1: by, line2: '', line2Html: '', lines: [by],
            /* ★W103-己（手机档那一半）：窄屏下**窗口头那行是隐藏的**（`#ywpu-head-sub { display:none }`）
               ⇒ 卡片摘要改回**标题那一行**（桌面档这一行不显示）—— 保证"**任一时刻恰好看得见一处**"：
                 PC = 窗口头那一行（带展开 + 两段色）· 手机 = 这张卡（原文那一行，一个字没少）。
               `mobByHtml` = 展开里那行出处（带"缝进 X"），**只在手机档显示**（PC 档摘要里已经有出处了）。 */
            mobTitle: '☁ 来自商店：《' + title + '》',
            mobByHtml: byHtml,
        };
    }
    const p = it.patch || null;
    if (p) {
        const from = String(p.from || '上一版'), to = String(p.to || '新版');
        const line1 = '📥 更新包文件：' + (p.fileName || '（没记住文件名）');
        return {
            kind: 'patch-file', title: line1, why: '', author: '', official: false,
            line1, line2: '这一版：' + from + ' → ' + to + ' · 缝进 ' + mine,
            line2Html: '这一版：' + fromEsc(from) + ' → ' + fromEsc(to) + ' · 缝进 ' + PN(mine), lines: [line1],
        };
    }
    return { kind: 'none', title: '', why: '', author: '', official: false, line1: '', line2: '', line2Html: '', lines: [] };
}

/** 来源块的 HTML。商店那块默认看得见 卡片标题 + 用途备注（**点开就是全文**，见下面的 W5 ①）。
 *  ★只吃数据、不读全局 —— 探针拿同一段源码真编译，纯 Node 也能跑出真实文案。
 *  ★M3：line2 优先用 `line2Html`（预设名带颜色）；没有这个字段的老数据退回转义纯文本（零回归）。 */
function srcBarHtml(m) {
    const d = m || {};
    if (!d.line1) return '';
    /* ★Wave W5 ①（2026-09-24 · V11 复验：既有缺陷 + 被 W2 ③ 放大）：
       备注**一律画全**，不再按"纯字数 > 160"决定裁不裁 —— 那条判据是**宽度无关**的，与"真超行"错配：
         · PC 一行 ~100 字 ⇒ 160 字才 2 行，`-webkit-line-clamp:3` 够不着（看着"没事"）；
         · 手机一行 ~25 字 ⇒ 3 行只有 ~75 字 ⇒ **88~160 字那一档必然被裁 1~2 行**
           （V11 真界面实测：122 字那档 显示 3 行 / 需要 5 行、尾标落在盒外）；
         而 W2 ③ 已按作者要求把内层「看完整用途说明」折叠整块删掉 ⇒ 手机上这一档**一个入口都没有**。
       作者原话："点开就是可以直接看完就好了…只要点开它就是完整用途说明（用户不想看会自己滑上去）。"
       ⇒ 这里只借 `srcClip` 的**空白归一**（内部换行折成空格、去首尾空白），一个字都不掐；
         限高那条规则同时从 CSS 的 `.ywpu-src-why` 里删掉（见 preset-updater.css 同一批注释）。
       ※ 那处判据的影响面（grep 证据）：全仓 `srcClip(` 只有**这一个调用点**（另两处是它的定义与改前注释），
         即"按字数掐"只作用于**来源块备注**这一处；条目正文 / 正则块 / 总览页没有任何字数判据。 */
    const why = srcClip(d.why, Infinity);
    const ic = d.kind === 'patch-file' ? '📥' : (d.kind === 'store' ? '🛒' : '☁');
    const line2Html = d.line2Html || (d.line2 ? srcEsc(d.line2) : '');
    /* ★S2-1（UI P3-② + 文案 §C7 + 台账 S2-1）：来源块**做成可折起的 `<details>`**（为了首屏瘦身）。
       ★U14（台账 §BO-7 的裁决点 · 2026-09-22 深夜 · **口径已改**）：**还是默认收起**，
       改成在卡上（收起态）写一句提示「展开」—— 不再默认把说明摊开。
       ★W95 ②（作者 2026-10-06）：原来是「不懂用法？点此展开看说明」，作者说"这句话缩成「展开」"⇒ 只留「展开」。
       作者原话（U14 那次改主意）："不默认展开了；在卡上（没展开之前）写一句提示：不懂用法？点此展开看说明。
       **不要做成按钮**，就是卡上的一行字，要美观。"
       为什么回退：U13 照"默认展开"落地后**自己量出的代价**是 —— PC 首行距顶 27.0% → 35.5%（备注 1 行）/40.6%（3 行）、
       手机 39.0% → 48.2%/53.6%，**超了 S2-1/R9-i 的首屏硬指标（PC ≤30% / 手机 ≤40%）**，一屏少看 2~3 条。
       现在的形态：常驻仍是 summary 那一行（**行高一个字没涨**：提示是这一行里的一个 flex 项，
       与标题同基线、行高同 1.35，见下面那条 `<span>` 与 CSS §15 的 `.ywpu-src-tip`）。
       边界（不许越）：① ~~里层「看完整用途说明」（`.ywpu-src-fold`）照旧收起~~ ⇒ ★**Wave W2 ③ 起整块删掉**
         （作者原话："点开就是可以直接看完就好了…不要再『看完整用途说明』"）—— 点开就是**完整**说明；
         ② 类名一个没动（.ywpu-srcbar / -h / -ic / -t / -m / -why / -fold 全在）—— 探针与 ui-audit 的受检表照旧命中；
         ③ `<details class="ywpu-srcbar` 这个串一个字没动（`r9f-updater-probe.js:215/304/313` 的变异测试按它取源码）；
         ④ 那句提示**只在**这块里（图例折块、条目里两处折块一个字没动）：它是 `summary` 的最后那个子节点，
            点它 = 点 summary（**不绑事件、不阻止冒泡**），展开后由 CSS 自己藏起来（`.ywpu-srcbar[open]` 那条）。 */
    return '<details class="ywpu-srcbar' + (d.kind === 'store' ? ' ywpu-srcbar-store' : '') + '" data-src="' + srcEsc(d.kind) + '">'
        + '<summary class="ywpu-src-h"><span class="ywpu-src-ic">' + ic + '</span>'
        /* ★W103-己：摘要这一行按屏宽二选一（同一时刻**只显示一处**）——
           桌面档 = `line1`（商店路是"出处"那行；其它路照旧是原来的那一行）
           手机档 = `mobTitle`（商店路的卡片标题那一行；窗口头那行在窄屏是隐藏的）。
           ★其它 kind（更新包文件那种）没有 mobTitle ⇒ 一个字都不变（零回归）。 */
        + '<span class="ywpu-src-t ywpu-src-deskonly">' + srcEsc(d.line1) + '</span>'
        + (d.mobTitle ? '<span class="ywpu-src-t ywpu-src-mobonly">' + srcEsc(d.mobTitle) + '</span>' : '')
        + '<span class="ywpu-src-tip">展开</span>'
        + '</summary>'
        /* ★W103-己：手机档的"出处 + 缝进 X"这一行（`mobByHtml`）——桌面档不画（摘要里已经写着出处了，
           窗口头也写着"缝进 X"）⇒ 与作者那句"下面的卡片里的可以丢弃"是同一条口径：**看得见的只留一处**。 */
        + (d.mobByHtml ? '<span class="ywpu-src-mobonly">' + d.mobByHtml + '</span>' : '')
        + (line2Html ? '<div class="ywpu-src-m">' + line2Html + '</div>' : '')
        /* ★Wave W2 ③（2026-09-24 · 作者第 20 批原话："点开就是可以直接看完就好了…不要再『看完整用途说明』"）：
           内层那层 `<details>` 整块删除 ⇒ 点开来源块就是**完整**说明（内容一个字没丢）。
           ★Wave W5 ①（2026-09-24 夜）：把 W2 ③ 留下的**半截**补完 —— 当时"超长那一档去掉限高、短的那一档
             照旧限 3 行"，而"超长"是按**纯字数 > 160**判的 ⇒ 手机上 88~160 字那一档照样被裁、又没有入口。
             现在**不分档**：备注全画（`.ywpu-src-why` 的限高整条删掉，见 CSS），一行到八行都完整可见。
           边界：① `.ywpu-src-fold` / `.ywpu-src-whyfull` / `.ywpu-src-why-full` 三个老类名**保留在 CSS 里**
             （老截图/老断言引到它们时不该找不到规则；JS 侧**一个都不再产出**）；
             ② 外层 `<details class="ywpu-srcbar` 一个字没动。 */
        + (why ? '<div class="ywpu-src-why">' + srcEsc(why) + '</div>' : '')
        + '</details>';
}
/** 「你这份和作者那份像不像」的实测占比（纯函数：决定要不要说"结构差得多"）。
 *  两边**都认得出**的条目（名字 / 编号 / 正文任一对上，内核 matchPresets 的配对阶梯会给 `mine && next`）
 *  占作者那份的比例 —— 这个数就是"自动定位还剩多少把握"的人话依据。
 *  条数太少（商店单条那种）返回 null：不比，免得误报。
 *  @param {Array} items analyze() 的 items */
function structureRatioOf(items) {
    const arr = Array.isArray(items) ? items : [];
    const nextTotal = arr.filter(it => it && it.next).length;
    const both = arr.filter(it => it && it.mine && it.next).length;
    if (nextTotal < 8) return null;
    return { nextTotal, both, ratio: both / Math.max(1, nextTotal), unfamiliar: (both / Math.max(1, nextTotal)) < 0.35 };
}

/** 这条"位置待定"的新条目，在**作者那份**里原来是挂在谁后面？（人话提示用它 —— "从哪来的"）
 *  纯函数：op 列表（带 `place` 的）与名字归一化函数都从外面传进来。
 *  `place.after` = §4.1 的锚点那条的名字；只有 `place.before` 时说明"它前面那条"还在。
 *  对不上（用户改名了 / 这条不是新增）→ 返回 ''（界面就少写半句，不瞎编）。 */
function anchorNameIn(ops, name, norm) {
    const arr = Array.isArray(ops) ? ops : [];
    const nf = typeof norm === 'function' ? norm : ((s) => String(s || '').trim());
    const want = nf(name);
    if (!want) return '';
    for (const o of arr) {
        if (!o || nf(o.name) !== want) continue;
        const p = o.place || {};
        const a = p.after ? String(p.after) : (o.after ? String(o.after) : '');
        if (a) return a;
        const b = p.before ? String(p.before) : (o.before ? String(o.before) : '');
        if (b) return '它前面那条 ' + b;
    }
    return '';
}

/* ==== ywpu-anchor-core:end ==== */

/** 这次会话"包应用"的报告（商店路 / P1 文件路 / P6 云端路各有一份；手动的普通对比没有） */
function patchReportNow() {
    if (S.patch && S.patch.report) return S.patch.report;
    if (S.store && S.store.report) return S.store.report;
    return null;
}

/** 位置待定的条目：名字 + 它在 ② 里的 identifier。identifier 是拿**名字**回到 analyze 的条目上找的
 *  —— 内核 `applyPatch` 的 add 分支就是把这条新条目塞进 ②，所以 ② 里必然有同名的那一条（`it.next`）。
 *  映射那一步是**纯函数**（在 anchor-core 里，探针拿同一段源码真编译跑过）。 */
function pendingEntries() {
    return pendingIdentOf(pendingAddsOf(patchReportNow()), S.analysis ? S.analysis.items : [], PM.normalizeName);
}
function pendingIdentSet() { return new Set(pendingEntries().map(x => x.ident).filter(Boolean)); }

/** 来源块的数据（§22 A1/A2）：把 S.store / S.patch 的**现状**喂给纯函数 `srcModel`。
 *  三个入口共用（商店 / 更新包文件 / 云端更新）；没有会话时 model.line1 = '' → 渲染出空串（不留空盒子）。 */
function sourceBarModel() {
    const p = S.patch;
    return srcModel({
        mineName: S.mineName,
        store: S.store ? {
            title: S.store.title, why: S.store.why, author: S.store.author,
            official: S.store.official, srcPreset: S.store.srcPreset,
        } : null,
        patch: p ? {
            fileName: p.fileName,
            from: (p.pack && p.pack.from) || '', to: (p.pack && p.pack.to) || '',
        } : null,
    });
}
/** 页顶那块来源块的 HTML（对比页 `#ywpu-summary` 第一块 / 更新包页 `#ywpu-patch-body` 顶部，**同一个组件**） */
function sourceBarHtml() { return srcBarHtml(sourceBarModel()); }

/** 「你这份和作者那份像不像」的实测占比（拿当前这次对比的 items 现算；口径在纯核心里）。
 *  ★只在"② 真是一份**别人的预设**"时才算，否则返回 null（宁可不说，也不瞎说）：
 *   · 商店来的整份预设（`kind === 'ywp-preset'`）→ ② 就是作者那份 ✓
 *   · 手动选两份对比（既没商店会话、也没更新包会话）→ 两份都是真预设 ✓
 *   · 商店条目 / 更新包那两条路 → ② 是"① + 这个包"拼出来的（跟 ① 天然几乎全同），
 *     比出来的永远是 ~100%，没意义 ✗ —— 那两条路的"并非余温"信号由**锚点找不到**（pending）来说，
 *     而且说得更准（连"原来挂在谁后面"都指得出来，见 anchorNameOf）。 */
function structureRatio() {
    if (!S.analysis) return null;
    const otherPreset = S.store ? (String(S.store.kind) === 'ywp-preset') : (S.patch ? false : true);
    if (!otherPreset) return null;
    return structureRatioOf(S.analysis.items);
}

/** 这条"位置待定"的新条目在作者那份里**原来挂在谁后面**（页顶人话提示用它说清"从哪来的"） */
function anchorNameOf(name) {
    const ops = (S.patch && S.patch.pack && Array.isArray(S.patch.pack.ops)) ? S.patch.pack.ops
        : (S.store && Array.isArray(S.store.anchors) ? S.store.anchors : []);
    return anchorNameIn(ops, name, PM.normalizeName);
}

/** 页顶那条人话提示（如实说"这条是从哪来的、为什么没找到位置"）。
 *  @returns {{pending:Array, low:Array, unresolved:Array, ratio:object|null, unfamiliar:boolean, lines:string[],
 *             jump:Array<object|null>, notes:string[]}} */
function anchorTrouble() {
    const rep = patchReportNow();
    const pending = pendingEntries();
    const low = rep && Array.isArray(rep.lowConf) ? rep.lowConf.filter(x => Number(x.conf) > 60) : [];
    const unresolved = rep && Array.isArray(rep.unresolved) ? rep.unresolved : [];
    const ratio = structureRatio();
    const unfamiliar = !!(ratio && ratio.unfamiliar);
    const list3 = (arr) => arr.slice(0, 3).map(x => '「' + String(x.name || x) + '」').join('、') + (arr.length > 3 ? '…' : '');
    const lines = [];
    /* ★W100-甲：`bodies` 与 `lines` **一一对应** —— 展开态正文里放哪一句（默认 = 整句原样）。
       只有"位置不太确定"那一句要换：收起态那行（= `lines[0]` 的前半截）已经写着"⚠ 有 N 条的位置不太确定"，
       展开态再重复一遍就是作者点名的"重复一句" ⇒ 正文只留"放哪儿可能不准…"这句人话。 */
    const bodies = [];
    const pushLine = (full, body) => { lines.push(full); bodies.push(body === undefined ? full : body); };
    /* ★W95（作者原话 ①："这个页面怎么点进去是一个重复的话？不应该是下面直接跳到那个位置吗？"）：
       与 `lines` **一一对应**的一张表 —— 每句提示"点「跳过去」该去哪一条"。
       `null` = 这句话没有可跳的单条目标（例如"结构差得多""有几条没找到"）。 */
    const jump = [];
    /* ★W95：正文里"**为什么**不确定"的人话（不是内核黑话）—— 改前正文没有这一块，点开只能看到
       跟收起态**一模一样**的那句话（作者点名的"重复的话"就是这个）。这几行**不带「内核原话」四个字**
       （`probe-p13.js` 的 D16 断言钉着"正文里不出现内核原话"），只把 `lowConf[].how` 摆出来。 */
    const notes = [];
    let whys = [];                       // ★D16：内核原话（给提示条的 title 用，正文里不再出现）
    let detail = [];                     // ★S2-1：**折进 title 的细节**（内核原话 / 原来是挂在谁后面 / 三条出路）
    // ① 结构差得多（作者那份的条目在你这儿基本认不出来）—— 这就是"并非余温预设"的**实测**信号
    if (unfamiliar) {
        pushLine('⚠ 你这份 ' + (S.mineName || '你的预设') + '跟作者那份结构差得多：作者那份 ' + ratio.nextTotal + ' 条里，只有 ' + ratio.both
            + ' 条在你这儿找得到（同编号 / 同名 / 正文一样都算）。自动找缝入位置基本靠不住 —— 下面的处理都按这个前提来，你自己挑位置最稳。');
        jump.push(null);                 // 这条说的是"整体"，没有单条可跳
    }
    // ② 位置待定：锚点整条找不到 → 内核把这条新条目塞到了顺序表末尾
    if (pending.length) {
        whys = pending.filter(x => x.how).map(x => x.name + '：' + x.how);
        // ★说清"这条是从哪来的"：作者那份里它挂在谁后面 + 你这儿为什么没对上（不瞎编：查不到就少写半句）
        const froms = pending.map(x => {
            const a = anchorNameOf(x.name);
            return a ? '「' + x.name + '」原来是挂在作者那份的' + (a.indexOf('它前面那条') === 0 ? a : ' ' + a + '后面') : '';
        }).filter(Boolean);
        /* ★S2-1（UI P4 + 台账 S2-1）：**一句说完**。
           原来这里是 2 行长文（"…你这份里没有那条锚点…所以内核先放到了最末尾" + "→ 已挪到最上面、你可以①②③"），
           紧接着下面那个灰蓝块（storeBarHtml）又把内核原话「「X」没找到邻居 → 先放进顺序表最后」**再说一遍** ——
           同一件事占 5 行。现在：正文只留 1 行（**s18 钉着的那句原串一个字没动**），
           内核原话 / 原来是挂在谁后面 / 三条出路**全部折进 `title`**（悬停或长按可见）。 */
        /* ★两句"实况"必须留在**正文**里（两句都钉着断言，见 e2e/probe-anchor-ui.js:139/141 与 probe-p13.js:454）：
           「找不到该插在哪」+「顺序表最末尾」+「已经把它们挪到」。搬进 title 的是**细节与三条出路**。 */
        pushLine('⚠ 有 ' + pending.length + ' 条新条目在你这儿找不到该插在哪（' + list3(pending) + '）——'
            + (froms.length ? froms.slice(0, 2).join('；') + '。' : '')
            + '内核先把它们放到了顺序表最末尾，已经把它们挪到「📋 新预设总览」的最上面、逐条标了「位置待定」。');
        /* ★W95 ①：这一句的「跳过去」= 切到「📋 新预设总览」并滚到那一行（作者："不应该直接跳到那个位置吗？"） */
        jump.push({ to: 'order', idents: pending.map(x => x.ident).filter(Boolean), names: pending.map(x => x.name) });
        detail.push('你这份里没有那条锚点（名字 / 编号 / 前后邻居 / 正文样本都没认出来），所以内核把它们放到了顺序表最末尾；'
            + '咱们再把它们提到「📋 新预设总览」的最上面并逐条标了「位置待定」。在那儿你可以：'
            + '① 拖动它们换位置；② 点它们行尾的「插在哪一条后面」自己选一处；③ 不管也行（放最上面照样能存下来）。');
        // ★S2-1：内核自己那句原话（原来重复印在灰蓝块里）也收进 title
        const kmsg = rep && Array.isArray(rep.warnings) ? rep.warnings.filter(w => /没找到邻居/.test(String(w))) : [];
        if (kmsg.length) detail.push('内核原话：' + kmsg.slice(0, 2).join('；'));
    }
    /* ③④ ★S2-1：这两块原来挂在**灰蓝块**（storeBarHtml）上，跟琥珀块说的是同一件事 → 并过来：
       · lowConf（55/75/80 的"位置不太确定"）—— 内核也没报"没找到邻居"，是独立信息，留一行；
       · unresolved（你这份里找不到这条 → 内核没动它）—— 同样留一行（绝不能悄悄吞掉）。 */
    if (low.length && pending.length) {
        /* ★W100-甲：整句照旧（收起态 = 前半截"⚠ 有 N 条的位置不太确定"）；正文换成作者给的那句
           （原话："放哪儿可能不准，可能需要手动拖拽校准确认位置"）—— 不再把"⚠ 有 N 条…"说第二遍。 */
        pushLine('⚠ 另有 ' + low.length + ' 条的位置不太确定（放哪儿可能不准，生成后在总览页拖一下）',
            '另有 ' + low.length + ' 条的位置不太确定 —— 放哪儿可能不准，可能需要手动拖拽校准确认位置');
    } else if (low.length) {
        pushLine('⚠ 有 ' + low.length + ' 条的位置不太确定（放哪儿可能不准，生成后在总览页拖一下）',
            '放哪儿可能不准，可能需要手动拖拽校准确认位置');
    }
    if (low.length) {
        /* ★W95 ①：这一句的「跳过去」= 按**内核这次到底动了什么**分流（`lowConf[].op` 是现成的凭据）：
           · `op === 'add'`（新增条目，锚点只是把握不大）→ 它**落在顺序表里**（正是那句话说的"总览页拖一下"）
             ⇒ 切「📋 新预设总览」并滚到那一行；
           · 其余（`update` / 正则那几支）→ 那是**你这份里已有的那一条** ⇒ 切「✍ 条目详细编辑」并展开它。
           非条目的 op（`regex-*`）不参与"条目跳转"（它没有对应的条目行）。 */
        const lowAdds = low.filter(x => String(x.op) === 'add');
        const lowUpd = low.filter(x => String(x.op) !== 'add' && String(x.op).indexOf('regex-') !== 0);
        const lowIdents = lowAdds.length
            ? pendingIdentOf(lowAdds.map(x => ({ name: x.name, how: x.how, conf: x.conf })), S.analysis ? S.analysis.items : [], PM.normalizeName).map(y => y.ident).filter(Boolean)
            : [];
        if (lowIdents.length) jump.push({ to: 'order', idents: lowIdents, names: lowAdds.map(x => String(x.name || '')) });
        else jump.push({ to: 'item', names: lowUpd.map(x => String(x.name || '')).filter(Boolean) });
        /* ★W95 ①：正文里补上"**为什么**不太确定"（`lowConf[].how` 是内核给的定位依据），
           这样点开看到的**是新内容**，不再是收起态那句话的复制（改前两处逐字相同 = 作者报的重复）。 */
        const whyLow = low.filter(x => x.how).map(x => '「' + String(x.name || '(未命名)') + '」：' + String(x.how));
        if (whyLow.length) notes.push('为什么不确定：' + whyLow.slice(0, 3).join('；'));
    }
    if (unresolved.length) {
        pushLine('⚠ 有 ' + unresolved.length + ' 条在你这份里没找到（' + list3(unresolved) + '）—— 这几条没动');
        jump.push(null);                 // 这几条**你这份里根本没有**，没有哪一行可跳
    }
    /* ★D16（audit-p12 人性化 C8）：「内核原话：…」那句黑话**从正文里拿掉**，折进提示条的 `title`（悬停才看）——
       正文只留人话（"在你这儿找不到位置、先放最上面、你可以拖动/自己选"）。whys 仍然回传（给 title 与口子用）。 */
    detail = detail.concat(whys.slice(0, 3).map(w => '内核原话：' + w));
    return { pending, low, unresolved, ratio, unfamiliar, lines, bodies, jump, notes,
        why: whys.slice(0, 3).join('；'), detail: detail.join('\n') };
}

/** ★W95 ①：收起态那一行只放**短标题**（整句的"前半截"，见 `tbHeadOf`）。
 *  改前放的是**整句**、而 `.ywpu-note` 正文里又是**同一句连后排** ⇒ 点开看到的第一行跟收起那行**逐字相同**
 *  （作者原话："这个页面怎么点进去是一个重复的话？"）。现在：收起 = 前半句，点开 = 整句 + 为什么。
 *  @param {string} line `anchorTrouble().lines[i]` */
function tbHeadOf(line) {
    const s = String(line == null ? '' : line).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    /* 就近取"第一个能断句的地方"：`（` 或 `（` 之后是括号说明、`——` 之后是补充。
       两个都不在就原样（短句不用截）。**截出来的串一定是原句的前缀**（半句真话，不新编一句话）。 */
    const i = s.search(/（|——/);
    if (i > 0) return s.slice(0, i).trim();
    return s.length > 28 ? (s.slice(0, 28).trim() + '…') : s;
}

/** ★W95 ①：提示条里的「跳过去」按钮（作者：点它应当**直接跳到那一条**）。
 *  · `data-tb-jump` = 要跳去的那句提示在 `lines` 里的下标（正文里每句一个）；
 *  · summary 里那一个用 `data-tb-jump="first"`（跳到第一条有目标的）。
 *  容器是 `.ywpu-tbwrap`（**在 `.ywpu-troublebar` 外面**）⇒ ui-audit 对 `.ywpu-troublebar` 的
 *  "新块字号/对比度受检表"一个字不受影响。 */
const tbJumpBtn = (idx, title) =>
    '<button class="ywpu-btn ywpu-mini ywpu-tbjump" data-tb-jump="' + esc(String(idx)) + '" title="' + esc(title) + '">跳过去 ▸</button>';

/** 页顶那条提示的 HTML（没话可说时**不渲染**，绝不留个空盒子）
 *  ★D16：内核那句原话挂在 `title` 上（悬停可见）——正文里不再出现"内核原话"四个字。
 *  ★S2-1：`title` 现在装的是**全部细节**（内核原话 + 原来是挂在谁后面 + 三条出路 + 那条没找到的）——
 *    正文只剩"要用户马上处理"的话，所以这一块从 3~5 行瘦到 1~3 行，也不会和下面的块说两遍。
 *  ★R9-i（首屏 S2-1 收尾）：整块再折一层 `<details>`（**默认收起**）—— 常驻只有 summary 那一行。
 *    依据（终评 §4.3 + §6.3-1）：这一块是首屏最大的一块（PC 2 行 / 手机 4~5 行），而它说的
 *    "有 N 条找不到位置"**在行里已经标了「位置待定」徽标、总览页也能看见**，不需要常态占 4 行。
 *    正文一个字没少（`.ywpu-note` 里还是那几句人话）—— 断言按 `textContent` 读，折起来照样读得到；
 *    `title` 也原样留在 summary 与正文两处（悬停/长按可见）。
 *  ★W95 ①（作者反馈 · 两处都动，改前/改后都能量）：
 *    ① **去重复**：summary 从"整句"改成"前半句"（`tbHeadOf`），正文照旧是**整句**（一个字没删）——
 *       点开看到的第一行不再与收起态逐字相同；正文里**多**一段"为什么不确定"（`t.notes`，人话）；
 *    ② **加跳转**：summary 右侧一颗「跳过去 ▸」（跳到第一条有目标的提示所指的那一条），
 *       正文里每句提示后面各跟一颗（各跳各的）。跳的目标由 `anchorTrouble().jump` 给：
 *       `{to:'order'}` → 切「📋 新预设总览」滚到那一行；`{to:'item'}` → 切「✍ 条目详细编辑」展开那一条。 */
function troubleBarHtml() {
    const t = anchorTrouble();
    if (!t.lines.length) return '';
    const tip = t.detail || (t.why ? ('内核原话：' + t.why) : '');
    const tit = tip ? ' title="' + esc(tip) + '"' : '';
    /* 正文 = **整句**（lines 全部，一个字没删）+ `t.notes`（为什么不确定）——
       每句后面按 `t.jump` 配一颗「跳过去」（没有目标的就不给按钮，不给假入口）。 */
    /* ★W100-甲：正文里**不再逐句挂「跳过去」**（作者原话："把里层的那个跳过去删掉，外层那颗留着"）——
       正文只留人话（`bodies`）；外层那一颗（summary 右边）跳"第一条有目标的那句"所指的那一条。 */
    const body = t.lines.map((l, i) => esc((t.bodies || [])[i] || l)).join('<br>')
        + (t.notes && t.notes.length ? '<br>' + t.notes.map(esc).join('<br>') : '');
    const firstJump = (t.jump || []).findIndex(Boolean);
    return '<div class="ywpu-tbwrap">'
        + '<details class="ywpu-troublebar">'
        + '<summary' + tit + '>' + esc(tbHeadOf(t.lines[0])) + '</summary>'
        + '<span class="ywpu-note"' + tit + '>' + body + '</span>'
        + '</details>'
        + (firstJump >= 0 ? tbJumpBtn('first', '跳到下面那一条（会切页签并滚过去）') : '')
        + '</div>';
}

/** ★W95 ①：点「跳过去」真的跳（真鼠标 / 脚本点击都走这一支）。
 *  · `to:'order'` → `S.view='order'` 重画，再把那一行滚到视口里并闪一下（复用 `backToOrder` 的手法）；
 *  · `to:'item'`  → 复用 `focusItem(key)`（它会切页签、展开、`scrollIntoView` + `ywpu-flash`）。
 *  @returns {string} 一句人话结果（探针直接读它当读数） */
function troubleJump(i) {
    const t = anchorTrouble();
    const j = (t.jump || [])[i];
    if (!j) return '没什么可跳的（这句提示没有单条目标）';
    if (j.to === 'item') {
        /* 逐个名字试（同名多条 / 有一条已经不在列表里时，**跳过认不出来的**，别拿第一个就认死） */
        const names = j.names || [];
        let key = '', nm = '';
        for (const cand of names) { const k = itemKeyByName(cand); if (k) { key = k; nm = cand; break; } }
        if (!key) return '没找到' + (names.length ? '「' + names[0] + '」' : '这条') + '这一条（可能它不在这次的列表里）';
        focusItem(key);
        return '已跳到「' + nm + '」（切到 ✍ 条目详细编辑 并展开）';
    }
    const idents = j.idents || [];
    S.view = 'order';
    renderView();
    if (!idents.length) return '已切到「📋 新预设总览」（那条的目标行没定位到 identifier）';
    setTimeout(() => {
        const row = document.querySelector('#ywpu-view-order .ywpu-orow[data-ident="' + cssEsc(idents[0]) + '"]');
        if (!row) return;
        row.scrollIntoView({ block: 'center' });
        row.classList.add('ywpu-flash');
        setTimeout(() => row.classList.remove('ywpu-flash'), 1400);
    }, 80);
    return '已跳到「📋 新预设总览」里那一条（共 ' + idents.length + ' 行要定位置，先看第一行）';
}

/** 名字 → 这次对比里那一条的 key（提示条的「跳过去」用它把名字翻成 item.key） */
function itemKeyByName(name) {
    const nm = PM.normalizeName(name);
    if (!nm || !S.analysis) return '';
    const hit = S.analysis.items.find(it => it && (PM.normalizeName(it.mine && it.mine.name) === nm || PM.normalizeName(it.next && it.next.name) === nm));
    return hit ? String(hit.key || '') : '';
}

// ---------------------------------------------------------------- 顺序：唯一一份（顺序页 / 两个拖动 / 手动指定 / 写盘共用）
//  ★§22 的用户要求就落在这一段上：
//   · "缝进去的时候默认在那个列表里面的最上面" → `pinned` 那几条**提到最前**（只在真有"找不到位置"时动）；
//   · "然后用户就可以自己进行一个拖动" / "可以让用户自己选择缝入的地方" → 拖动与下拉**都改 S.orderOverride**；
//   · 写盘时把**同一份 ids** 当 `orderOverride` 交给内核 → 看到的顺序 = 写盘的顺序。

/** 顺序页要画的行 + 写盘要用的那份顺序（**同一个函数**，不许各算一套）
 *  @returns {{auto:Array, rows:Array, ids:string[], pinned:Set<string>}}
 *   auto  = 纯内核顺序（"从第 N 位挪来"拿它比）
 *   rows  = 内核顺序 → 位置待定提到最前 → 套上用户手动顺序
 *   ids   = rows 的 identifier（写盘时当 orderOverride 用） */
function orderRowsNow() {
    const an = S.analysis;
    const ex = extras();
    const build = (odr) => {
        const { preset } = PM.buildMerged({
            mine: S.mine, next: S.next, items: an.items, decisions: S.decisions,
            params: [], orderMode: S.orderMode, orderOverride: odr || null,
            // ★必须把 id 作为 identifier 传下去：否则内核每次生成随机 id，拖动记的位次全对不上
            extraEntries: ex.map(e => ({ ...e, identifier: e.id })),
        });
        const g = PM.getOrderGroup(preset, PM.CHAT_ORDER_DUMMY_ID);
        const byId = new Map((preset.prompts || []).map(x => [String(x?.identifier), x]));
        return (g && g.order ? g.order : []).map(o => ({
            identifier: String(o.identifier),
            name: (byId.get(String(o.identifier)) || {}).name || '(未命名)',
            enabled: o.enabled !== false,
        }));
    };
    let auto = [];
    try { auto = build(null); } catch (e) { console.warn('[预设更新器] 预览合并顺序失败', e); }
    const pinned = pendingIdentSet();
    let rows = auto;
    if (pinned.size) {
        const hit = new Set(auto.map(r => r.identifier).filter(id => pinned.has(id)));
        if (hit.size) {
            const ordered = pinFirst(auto.map(r => r.identifier), hit);
            const byIdent = new Map(auto.map(r => [r.identifier, r]));
            rows = ordered.map(id => byIdent.get(id) || { identifier: id, name: '(未命名)', enabled: true });
        }
    }
    if (Array.isArray(S.orderOverride) && S.orderOverride.length) {
        const pos = new Map(S.orderOverride.map((id, i) => [String(id), i]));
        const inl = rows.filter(r => pos.has(r.identifier));
        const rest = rows.filter(r => !pos.has(r.identifier));
        inl.sort((a, b) => pos.get(a.identifier) - pos.get(b.identifier));
        rows = [...inl, ...rest];
    }
    return { auto, rows, ids: rows.map(r => r.identifier), pinned };
}

/** 写盘（生成新预设 / 缝入当前预设）时该传给内核的 orderOverride。
 *  只有"真有位置待定的"或"用户自己调过顺序"才传；其它情况传 null = 老行为一个字不变（零回归面）。 */
function orderOverrideForBuild() {
    const r = orderRowsNow();
    const need = (r.pinned && r.pinned.size) || (Array.isArray(S.orderOverride) && S.orderOverride.length);
    return { override: need ? r.ids : null, pinned: r.pinned, rows: r.rows, auto: r.auto };
}

/** 我这份预设的顺序表（条目名）——"插在哪一条后面"那个下拉就用它 */
function mineOrderEntries() {
    if (!S.mine) return [];
    try {
        const idx = PM.indexPreset(S.mine);
        const byId = new Map(idx.entries.map(e => [String(e.identifier), e]));
        return idx.orderList.map(o => {
            const e = byId.get(String(o.identifier)) || {};
            return { ident: String(o.identifier), name: String(e.name || '(未命名)') };
        });
    } catch (e) { console.warn('[预设更新器] 读我这份的顺序表失败', e); return []; }
}

/** 我这份里的某条 identifier → **结果里**它的 identifier（新版骨架用的是 ② 的编号）。
 *  两边都有 → 用 ② 的（内核配对后的 identifier）；只有我有 → 用我自己的。 */
function mergedIdentOfMine(mineIdent) {
    const an = S.analysis;
    if (!an) return '';
    const it = an.items.find(x => x.mine && String(x.mine.identifier) === String(mineIdent));
    if (!it) return '';
    return String((it.next && it.next.identifier) || it.mine.identifier || '');
}

/** ★B5：手动指定"插在哪一条后面"（下拉 + 搜索）。选中即刻生效：改 S.orderOverride → 重绘。
 *  @param {string} ident        要挪的那一条在结果里的 identifier
 *  @param {string} targetIdent  插到谁后面（'' = 放到最上面） */
function applyPosPick(ident, targetIdent) {
    const id = String(ident || '');
    if (!id) return false;
    const { rows, ids } = orderRowsNow();
    const cur = new Map(rows.map((r, i) => [r.identifier, { i, name: r.name }]));
    if (!cur.has(id)) { toast('warning', '这条不在结果里（可能被你去掉了）—— 位置改不了'); return false; }
    const t = String(targetIdent || '');
    if (t && !cur.has(t)) {
        toast('warning', '你选的那条在新预设里没有（被你去掉了 / 不参与注入）—— 换一条吧');
        return false;
    }
    const next = moveAfter(ids, [id], t);
    S.orderOverride = next;
    const at = next.indexOf(id) + 1;
    const ti = t ? cur.get(t) : null;
    toast('success', '位置改好了：现在插在' + (t ? ' ' + ti.name + '后面（第 ' + at + ' 位）' : '最上面（第 1 位）'));
    console.info('[预设更新器] 手动指定位置', { 条目: cur.get(id).name, 插在谁后面: t ? ti.name : '（最上面）', 新位次: at });
    if (S.view === 'order') renderOrderView(); else renderResult();
    return true;
}

/** 「插在哪一条后面」这一块（顺序页行尾 / 条目编辑页都用它，**同一个组件**）
 *  @param {string} ident        要挪的那一条在结果里的 identifier
 *  @param {string} [why]        为什么要有它（内核对这条的判据原话）—— 非紧凑版会显示一行小字
 *  @param {{compact?:boolean, cur?:string}} [opts] cur = "现在插在哪"的人话（调用方已经算过就传进来，省一次推算） */
function posPickHtml(ident, why, opts) {
    const id = String(ident || '');
    if (!id) return '';
    const o = opts || {};
    const list = mineOrderEntries();
    if (!list.length) return '';
    const byMerged = new Map();
    for (const x of list) {
        const mi = mergedIdentOfMine(x.ident);
        if (mi && !byMerged.has(mi)) byMerged.set(mi, x.name);
    }
    // 当前插在哪条后面（调用方没给就现推：它在结果顺序里上面那一条是谁；推不出来就只写第 N 位）
    let curText = String(o.cur || '');
    if (!curText) {
        try {
            const { rows } = orderRowsNow();
            const i = rows.findIndex(r => r.identifier === id);
            if (i > 0) curText = '第 ' + (i + 1) + ' 位（在 ' + rows[i - 1].name + '后面）';
            else if (i === 0) curText = '第 1 位（最上面）';
        } catch (e) { /* 算不出来就不写"现在在哪"，不影响选 */ }
    }
    return `<div class="ywpu-pospick" data-posfor="${esc(id)}">
        <span class="ywpu-pospick-t">插在哪一条后面？</span>
        <input class="ywpu-input ywpu-posq" data-posq="1" placeholder="搜条目名…" title="在你这份预设里搜条目名，下面的下拉只剩匹配的">
        <select class="ywpu-input ywpu-poss" data-possel="1" title="选中即刻生效：这一条就插在你选的那条后面（改完在「新预设总览」里看得见）">
            <option value="">（放到最上面）</option>
            ${[...byMerged.entries()].map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}
        </select>
        ${curText ? `<span class="ywpu-pospick-now">现在：${esc(curText)}</span>` : ''}
        ${(why && !o.compact) ? `<span class="ywpu-pospick-why" title="内核原话：${esc(why)}">位置待定（鼠标停在字上能看到内核怎么说的）</span>` : ''}
    </div>`;
}

/** ★§22：条目编辑页里的「位置」那一行（**展开这一条才画**）：
 *  · 显示"现在第几位、在谁后面"（改位置的两个入口：**长按条目本体拖动** / 新增条目再给「插在哪一条后面」下拉）。
 *  ★R6-e（M2）：用户把"展开后拖手柄"这个口径**作废**了 —— 原话是"正常用户逻辑 = 不展开、在条目上长按才进入拖动"，
 *    所以这里**不再画**「⠿ 拖我换位置」那块（B13b 也一起作废），拖动入口统一成"长按条目本体"（见 `bindItemDrag`）。 */
function posRowHtml(it) {
    if (!S.analysis) return '';
    const ident = String((it.next && it.next.identifier) || (it.mine && it.mine.identifier) || '');
    if (!ident) return '';
    const { rows } = orderRowsNow();
    const at = rows.findIndex(r => r.identifier === ident);
    if (at < 0) return '';                       // 不在结果里（被你去掉了 / 不参与注入）→ 位置无从谈起
    const pend = pendingEntries().find(x => x.ident === ident) || null;
    const isNew = !!(it.next && !it.mine);
    const cur = at > 0 ? ('第 ' + (at + 1) + ' 位（在 ' + rows[at - 1].name + '后面）') : '第 1 位（最上面）';
    return `<div class="ywpu-posrow">
        <span class="ywpu-posnow">现在：${esc(cur)}</span>
        <span class="ywpu-poshint">换位置：按住这一条<b>不动</b>约半秒（长按）再上下拖；松手后可以点「↩ 撤销拖动」退回原位</span>
    </div>${isNew ? posPickHtml(ident, pend ? pend.how : '', { compact: !pend, cur }) : ''}`;
}

/** 给一个容器里的「插在哪一条后面」块绑上事件（搜索过滤 + 选中生效）。
 *  ⚠ 容器只换 innerHTML、元素本身不换 → 必须**赋值式**绑定（addEventListener 会叠加）。 */
function bindPosPick(host) {
    if (!host) return;
    host.querySelectorAll('.ywpu-pospick').forEach(box => {
        const ident = box.getAttribute('data-posfor');
        const sel = box.querySelector('[data-possel]');
        const q = box.querySelector('[data-posq]');
        if (q && sel) {
            const all = [...sel.querySelectorAll('option')].map(x => ({ v: x.value, t: x.textContent }));
            q.oninput = () => {
                const kw = q.value.trim().toLowerCase();
                const keep = sel.value;
                sel.innerHTML = all.filter(x => !kw || !x.v || x.t.toLowerCase().includes(kw))
                    .map(x => `<option value="${esc(x.v)}">${esc(x.t)}</option>`).join('');
                if ([...sel.options].some(x => x.value === keep)) sel.value = keep;
                if (kw && sel.options.length === 2) sel.selectedIndex = 1;   // 只剩一个候选 → 直接选中它（省一次点击）
            };
        }
        if (sel) sel.onchange = () => { applyPosPick(ident, sel.value); };
    });
}

/* ---------------- ★B13（R6-e 重做）：条目编辑页的拖动 = **不展开、长按条目本体** ----------------
 *  用户口径（2026-09-21 第三批 M2，原文）："正常用户逻辑 = **不展开**、**在条目上长按（长按久一点）**才进入拖动"，
 *  并且"拖动要**像「新预设总览」那种有弹性/明显的反馈**"（B14 同一句要求）。
 *  于是这一版：
 *   · **去掉**「拖我换位置」那块 + 去掉"先展开才有手柄"（B13a"点了没效果"随这块一起消失）；
 *   · 手势 = 在条目身上（收起态也行）**按住不动 400ms** 才进拖动态 —— 在这之前指针一动就算"点/滚"，直接放弃；
 *   · 进拖动态后**即时可见**（B13c）：条目本身打 `ywpu-dragging`（虚化留个"洞"）+ 跟手影子 + 落点细线 +
 *     页底一条浮动提示"松手放到第 N 位"（`S.drag.slot` 同步更新，浏览器侧断言直接读它）；
 *   · 松手落位 → `applyPosPick`（跟顺序页/下拉**同一套排序**）+ 记一条 **`S.dragUndo`**（B13d 的撤销用）。
 *  ★document 级只绑一次（容器会重绘，绑容器上就叠加了 —— 这个坑本文件踩过）。 */

/* ---------------- ★V（AR6）：拖动的手感三件 —— 禁选 / 跟手（占位块 + 落点线）/ 实时重排 ----------------
 *  作者原话（台账 §AR6）：
 *    · "拖选…拖着拖着会**像全选文字一样刮起来**"  → 拖动期间必须禁选；
 *    · "这是**假拖动**：拖完只在上面跳一句'已拖动'，用户**根本不知道自己拖到哪**"
 *      → 要有跟手 + 落点线 + **列表实时重排**（"像新预设总览那种有弹性/明显的反馈"）。
 *  这四样在**条目详细编辑页**与**新预设总览页**共用同一套实现（下面四个函数），
 *  免得两个页面各写一份、以后只修一处（"点行不跳转"那类 BUG 就是这么来的）。
 *  ① `noSelOn()/noSelOff()`：长按成立那一刻起**整页**禁选（`body.ywpu-nosel` + 面板那条老的
 *     `#ywpu-root.ywpu-drag-on`）；松手/取消**每一条路径**都要撤（见下面两个调用点）。
 *     `wireNoSel()` 再加 `selectstart`/`dragstart` 兜底 —— 原生选区、原生拖拽影子都别来抢。
 *  ② `dragStepDir()`（纯逻辑，见 `ywpu-dragcore` 段）：占位块该不该跟上一个/下一个邻居换位。
 *  ③ `liveReorderRow()`：按指针把"被拖的那一行"**就地挪**（列表实时重排 = 上下邻居真的让位）。 */

/** ★V① 禁选状态（**有加必有撤**：加在"长按成立"、撤在松手/取消的每条路上）。
 *  为什么连 `body` 一起禁：拖动时指针会滑到面板外的消息区正文上，
 *  只禁面板里面照样把外面那片文字刷蓝（作者说的"刮起来"就是它）。 */
const NOSEL = { on: false, wired: false };
function noSelOn() {
    NOSEL.on = true;
    try {
        if (document.body) document.body.classList.add('ywpu-nosel');
        const root = document.getElementById('ywpu-root');
        if (root) root.classList.add('ywpu-drag-on');       // 老类，CSS 里本来就有"面板内禁选"那条
    } catch (e) { /* 拿不到 body/root 也不影响拖动本身 */ }
}
function noSelOff() {
    NOSEL.on = false;
    try {
        if (document.body) document.body.classList.remove('ywpu-nosel');
        const root = document.getElementById('ywpu-root');
        if (root) root.classList.remove('ywpu-drag-on');
    } catch (e) { /* 同上 */ }
}
/** ★V① 兜底：`selectstart` / `dragstart` 都别来抢（原生选区、原生拖拽）。
 *  **只绑一次**（幂等）；只在"拖动真开着"时拦，平时一个字都不拦。 */
function wireNoSel() {
    if (NOSEL.wired) return;
    NOSEL.wired = true;
    const stop = (ev) => { if (NOSEL.on && ev.cancelable) ev.preventDefault(); };
    document.addEventListener('selectstart', stop, true);
    document.addEventListener('dragstart', stop, true);
}

/* ==== ywpu-dragcore:start（纯逻辑，别在这段里引用外面的东西 —— 探针会把这段单独抽出来跑）==== */
/** ★V② 占位块该不该再挪一格（**纯函数**：只吃几何数字，不碰 DOM）。
 *  一步一格 + 只认"邻居的中线"是这套拖动"不抽搐"的关键：换成"一次算到位"
 *  （数有几行的中线在指针上面）就会抖 —— 占位块自己占着高度，换位之后几何跟着变，
 *  指针压在边界上时会一格一格来回翻。
 *  @param {number} y              指针的 clientY
 *  @param {number|null} prevMid   上一个邻居的中线（null = 已经在最前）
 *  @param {number|null} nextMid   下一个邻居的中线（null = 已经在最后）
 *  @returns {-1|0|1} -1 = 跟上一个邻居换位；1 = 跟下一个邻居换位；0 = 停住 */
function dragStepDir(y, prevMid, nextMid) {
    if (prevMid != null && y < prevMid) return -1;
    if (nextMid != null && y > nextMid) return 1;
    return 0;
}

/** ★V③ 把"被拖的那一行"当**占位块**就地挪到指针那一格（列表实时重排：上下邻居真的让位）。
 *  · 几何全部现读浏览器排好的 `getBoundingClientRect()`（**不写死任何坐标**，也不动 margin/padding）；
 *  · 每次只换一格、换完再读一次 —— 所以"算出来的落点"和"眼睛看到的落点"永远是一回事。
 *  @param {Element} row          被拖的那一行（它自己就是占位块，仍在列表里）
 *  @param {()=>Element[]} rowsOf 取"当前参与这一列的行"（按 DOM 顺序；各视图自己给）
 *  @param {number} y             指针的 clientY
 *  @returns {number} 占位块在 rowsOf() 里的下标（0 = 第 1 位）；这一行不在里面 → -1 */
function liveReorderRow(row, rowsOf, y) {
    for (let guard = 0; guard < 200; guard++) {
        const all = rowsOf();
        const i = all.indexOf(row);
        if (i < 0) return -1;
        const prev = i > 0 ? all[i - 1] : null;
        const next = i + 1 < all.length ? all[i + 1] : null;
        const pb = prev ? prev.getBoundingClientRect() : null;
        const nb = next ? next.getBoundingClientRect() : null;
        const dir = dragStepDir(y, pb ? pb.top + pb.height / 2 : null, nb ? nb.top + nb.height / 2 : null);
        if (dir < 0) { prev.before(row); continue; }
        if (dir > 0) { next.after(row); continue; }
        return i;
    }
    return -1;      // 兜底：两百格还没停（理论上不可能）→ 当"没挪动"，绝不空转
}
/* ==== ywpu-dragcore:end ==== */

const ITEM_DRAG = { wired: false, timer: 0, st: null, LONG_MS: 400, suppressClickUntil: 0 };
/** 长按/拖动之后的那个 click 别再被当成"点一下展开"（B13：长按不该顺手把条目展开/收起） */
const dragAteClick = () => Date.now() < ITEM_DRAG.suppressClickUntil;
function bindItemDrag() {
    if (ITEM_DRAG.wired) return;
    ITEM_DRAG.wired = true;
    wireNoSel();                                   // ★V①：selectstart / dragstart 兜底（只绑一次）
    const yOf = (ev) => (ev.touches ? ev.touches[0].clientY : ev.clientY);
    const xOf = (ev) => (ev.touches ? ev.touches[0].clientX : ev.clientX);
    const identRows = () => {
        const ids = new Set(orderRowsNow().rows.map(r => r.identifier));
        return [...document.querySelectorAll('#ywpu-list .ywpu-item[data-key]')]
            .filter(r => { const id = r.getAttribute('data-ident'); return id && ids.has(id); });
    };
    const rowsExcept = (ident) => identRows().filter(r => r.getAttribute('data-ident') !== ident);
    /** ★V②：**按当前 DOM 顺序**返回这一批行（拖动中每帧都要用）。
     *  为什么要有它：`identRows()` 每次都要跑 `orderRowsNow()`（= 两遍内核 `buildMerged`），
     *  拖动中每帧调好几次会把手感拖垮（作者要的正是"有弹性"）。
     *  而"这一批行"在一次拖动里**不会变**（变的是顺序）⇒ 拖动开始时抓一次池子，之后只重排、不重算。
     *  @param {Element[]} pool 拖动开始时抓的那一批（见 `move()` 里的 `st.pool = identRows()`） */
    const poolRows = (pool) => {
        const want = new Set(pool || []);
        const out = [];
        document.querySelectorAll('#ywpu-list .ywpu-item[data-key]').forEach(r => { if (want.has(r)) out.push(r); });
        return out;
    };
    /** 指针落在第几个"缝"上：0 = 最上面，i = 第 i 行的下面 */
    const slotOf = (y, rows) => {
        for (let i = 0; i < rows.length; i++) {
            const b = rows[i].getBoundingClientRect();
            if (y < b.top + b.height / 2) return i;
        }
        return rows.length;
    };
    const ensureLine = () => {
        let ln = document.querySelector('#ywpu-list .ywpu-dropline');
        if (!ln) { ln = document.createElement('div'); ln.className = 'ywpu-dropline'; }
        return ln;
    };
    /** ★V②：落点线 + **占位块实时重排**（AR6 的"真拖动"核心）。
     *  老版：只画一条线 + 给邻居刷一层 box-shadow（几何一点不动）⇒ 作者："假拖动，拖完不知道自己拖到哪"。
     *  现在：**被拖的那一行自己就是占位块**（`ywpu-dragging`：虚线框 + 半透明），按指针就地跟邻居换位 ——
     *  上下邻居真的让位，而落点线永远贴在它**前面**（= "将会插到这一行之前"）。
     *  几何全现读、不动任何 margin/padding ⇒ 落点判定与眼睛看到的永远一致（老 BUG v3.3-7 的那类漂移不会再出现）。 */
    const moveLine = (y, rows) => {
        const ln = ensureLine();
        const st = ITEM_DRAG.st;
        const at = st ? liveReorderRow(st.el, () => poolRows(st.pool), y) : -1;
        if (at < 0) {
            // 兜底（还没进拖动态 / 这一行不在列表里）：退回老口径"按指针几何插线"
            const slot = slotOf(y, rows);
            if (slot < rows.length) rows[slot].before(ln); else if (rows.length) rows[rows.length - 1].after(ln);
            rows.forEach((r, i) => r.classList.toggle('ywpu-giveway', i === slot - 1));
            return slot;
        }
        st.el.before(ln);                                  // 线贴着占位块：一眼看出"会插到这一行之前"
        const all = poolRows(st.pool);                     // 换位之后的真实顺序（"我给它让位"要按新的算）
        const k = all.indexOf(st.el);
        all.forEach((r, i) => r.classList.toggle('ywpu-giveway', i === k - 1 && r !== st.el));
        return at;                                         // 占位块下标 = 老口径的 slot（0 = 最上面）
    };
    /** 页底那条浮动提示（拖动中"即时可见"的那句"松手放到第 N 位"）；没有就现造一个 */
    const tipEl = () => {
        let t = document.getElementById('ywpu-dragtip');
        if (!t) {
            t = document.createElement('div');
            t.id = 'ywpu-dragtip';
            t.className = 'ywpu-dragtip';
            const root = document.getElementById('ywpu-root') || document.body;
            root.appendChild(t);
        }
        return t;
    };
    const setTip = (txt, live) => {
        const t = tipEl();
        t.textContent = txt || '';
        t.classList.toggle('ywpu-dragtip-on', !!txt);
        t.classList.toggle('ywpu-dragtip-live', !!live);
    };
    const clearMarks = () => {
        document.querySelectorAll('#ywpu-list .ywpu-dropline').forEach(l => l.remove());
        document.querySelectorAll('#ywpu-list .ywpu-item').forEach(r => {
            r.classList.remove('ywpu-armed', 'ywpu-dragging');
            r.classList.remove('ywpu-giveway');
        });
        S.drag = { on: false, ident: '', slot: 0 };
    };
    const slotWord = (slot, rows) => (slot <= 0 ? '最上面' : ('第 ' + (slot + 1) + ' 位' + (rows[slot - 1] ? '（在 ' + (rows[slot - 1].querySelector('.ywpu-item-name')?.textContent || '') + '后面）' : '')));
    const start = (el, ev) => {
        const ident = el.getAttribute('data-ident') || '';
        if (!ident) return;
        ITEM_DRAG.st = { el, ident, y0: yOf(ev), x0: xOf(ev), armed: false, dragging: false, ghost: null, y: yOf(ev) };
        clearTimeout(ITEM_DRAG.timer);
        ITEM_DRAG.timer = setTimeout(() => {
            const st = ITEM_DRAG.st;
            if (!st) return;
            st.armed = true;
            st.el.classList.add('ywpu-armed');
            S.drag = { on: true, ident: st.ident, slot: 0 };
            noSelOn();          // ★V①：长按成立**那一刻**就禁选（不是等拖起来）—— 作者"刮起来"就发生在这段
            const nm = st.el.querySelector('.ywpu-item-name')?.textContent || '这一条';
            setTip('✋ 抓住 ' + nm + '了 —— 上下移动换位置，松手生效', true);
        }, ITEM_DRAG.LONG_MS);
    };
    const move = (ev) => {
        const st = ITEM_DRAG.st;
        if (!st) return;
        const y = yOf(ev);
        st.y = y;
        // 长按还没成立 → 指针一动就是"点/滚"，不算拖动（跟顺序页同一条规矩）
        if (!st.armed) {
            if (Math.abs(y - st.y0) + Math.abs(xOf(ev) - st.x0) > 8) { clearTimeout(ITEM_DRAG.timer); ITEM_DRAG.st = null; }
            return;
        }
        if (!st.dragging) {
            if (Math.abs(y - st.y0) < 6) return;
            st.dragging = true;
            /* ★V②：进拖动态这一下**只算一次**"这一批行是谁"（`identRows()` 要跑两遍内核 buildMerged）；
               之后每帧只按 DOM 顺序重排（`poolRows`），手感才跟得上（作者要的就是这个"弹性"）。 */
            st.pool = identRows();
            const gh = document.createElement('div');
            gh.className = 'ywpu-ghost ywpu-ghost-item';
            gh.textContent = st.el.querySelector('.ywpu-item-name')?.textContent || '这条';
            document.body.appendChild(gh);
            st.ghost = gh;
            st.el.classList.add('ywpu-dragging');       // ★即时可见：原位虚化留个"洞"
        }
        if (st.ghost) {
            st.ghost.style.left = (xOf(ev) + 12) + 'px';
            st.ghost.style.top = (y - 14) + 'px';
        }
        const othersOf = () => poolRows(st.pool).filter(r => r !== st.el);
        const slot = moveLine(y, othersOf());
        S.drag.slot = slot;                             // ★B13c：位次实时更新（浏览器侧断言读它）
        if (st.ghost) st.ghost.setAttribute('data-slot', String(slot + 1));
        // ★V②：提示里那句"在〈谁〉后面"要按**换位之后**的顺序取（换位那一刻上面那一行会变）
        setTip('🔒 拖动中 · 松手放到' + slotWord(slot, othersOf()), true);
        if (ev.cancelable) ev.preventDefault();
    };
    const end = (ev, cancel) => {
        const st = ITEM_DRAG.st;
        clearTimeout(ITEM_DRAG.timer);
        ITEM_DRAG.st = null;
        noSelOff();          // ★V①：松手/取消都撤（这条路上后面有 4 个 return，撤在这儿最稳、绝不留残留）
        if (!st) return;
        if (st.ghost) st.ghost.remove();
        const wasDragging = st.dragging;
        const wasArmed = st.armed;
        const ident = st.ident;
        const rows = wasDragging ? rowsExcept(ident) : [];
        /* ★V②：落点 = **占位块最后停在哪**（拖动中实时重排已经把它挪到落点上了，跟眼睛看到的一致）；
           万一位次没记上（比如这一条中途被过滤掉了）→ 退回老口径"按指针几何算"。 */
        const slot = wasDragging
            ? (S.drag.ident === ident && Number.isFinite(S.drag.slot)
                ? Math.max(0, Math.min(rows.length, S.drag.slot))
                : slotOf(yOf(ev), rows))
            : 0;
        clearMarks();
        setTip('');
        // ★长按过 / 拖过 → 这一个 click 不许再当"点一下展开"（B13：长按不该顺手把条目展开）
        if (wasArmed || wasDragging) ITEM_DRAG.suppressClickUntil = Date.now() + 400;
        if (!wasDragging) {
            if (wasArmed && !cancel) toast('info', '想换位置：按住这条别松、直接上下移动；只长按不会改位置');
            return;
        }
        const target = slot <= 0 ? '' : String(rows[slot - 1].getAttribute('data-ident') || '');
        const before = Array.isArray(S.orderOverride) ? S.orderOverride.slice() : null;   // ★B13d：拖动前的初始位置
        const ok = applyPosPick(ident, target);
        if (ok) {
            // ★§BY-H：同一串拖动只保留**最初**那份 before（撤销一次 = 回到"进入拖动前那一刻"）
            S.dragUndo = undoRecordFor(S.dragUndo, ident, before, Date.now());
            // 落下后把"撤销拖动"那颗按钮画出来（就在这一条的操作行右边）
            if (S.view === 'order') renderOrderView(); else renderList();
            renderFoot();
            toast('info', '位置换好了 —— 想退回拖动前：点这一条上的「↩ 撤销拖动」');
        } else {
            // ★V②：写回被拒（这条不在结果里之类）→ 把"实时重排"改过的 DOM 拉回状态里的真实顺序，
            //   绝不留下"界面显示的顺序 ≠ 会写盘的顺序"这种假象
            if (S.view === 'order') renderOrderView(); else renderList();
        }
    };
    document.addEventListener('mousedown', (ev) => {
        const el = ev.target.closest && ev.target.closest('#ywpu-list .ywpu-item[data-key]');
        if (!el) return;
        // 交互元素上按下不算拖动（按钮/输入框/色块/折叠块/把手…都由它们自己处理）
        if (ev.target.closest('button, input, textarea, select, a, .ywpu-grp, .ywpu-fold, summary, details, .ywpu-pickbar, .ywpu-opt, .ywpu-seg, .ywpu-pospick, .ywpu-knobwrap')) return;
        start(el, ev);
    }, true);
    document.addEventListener('mousemove', (ev) => { if (ITEM_DRAG.st) move(ev); }, true);
    document.addEventListener('mouseup', (ev) => { if (ITEM_DRAG.st) end(ev, false); }, true);
    document.addEventListener('touchstart', (ev) => {
        const el = ev.target.closest && ev.target.closest('#ywpu-list .ywpu-item[data-key]');
        if (!el) return;
        if (ev.target.closest('button, input, textarea, select, a, .ywpu-grp, .ywpu-fold, summary, details, .ywpu-pickbar, .ywpu-opt, .ywpu-seg, .ywpu-pospick, .ywpu-knobwrap')) return;
        start(el, ev);
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', (ev) => { if (ITEM_DRAG.st) move(ev); }, { capture: true, passive: false });
    document.addEventListener('touchend', (ev) => { if (ITEM_DRAG.st) end(ev, false); }, true);
    document.addEventListener('touchcancel', () => { if (ITEM_DRAG.st) end(null, true); }, true);
}

/* ==== ywpu-undo-core:start（纯逻辑，别在这段里引用外面的东西 —— 探针会把这段单独抽出来跑）==== */
/** 两份顺序**逐位相同**吗（撤销的正确性判据就是它，不是"长度一样"）。
 *  null 与"空"都算"没有手调顺序" → 彼此相同。 */
function sameSeq(a, b) {
    const x = Array.isArray(a) && a.length ? a : null;
    const y = Array.isArray(b) && b.length ? b : null;
    if (x === null || y === null) return x === y;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (String(x[i]) !== String(y[i])) return false;
    return true;
}
/** ★§BY-H（2026-09-23 · 作者第十七批 · 真 BUG）：**记一条"可撤销的拖动"**。
 *  作者原话："它判定的标准不是最初，而是刚才" —— 来回拖两个条目后，撤销会把其中一条拖到**错误位置**。
 *  根因：条目列表（鼠标松手）与「新预设总览」（onUp）两处都写的是 `S.dragUndo = { ident, before: S.orderOverride }`，
 *  `before` 取的是**这一次**拖动之前的那份顺序 ⇒ 拖 A（before=最初）→ 再拖 B（before=拖完 A 的）⇒ 撤销只退回到
 *  "拖完 A"，**回不到最初**。
 *  口径（作者点名的那一个）：**撤销 = 回到"进入拖动前那一刻的初始顺序"** —— 同一串拖动只保留**第一次**那份
 *  `before`；撤销按钮仍旧画在**最后拖过的那一条**上（ident 每次更新），点一次就整串退回最初。
 *  @param {object|null} prev        已经挂着的那条撤销记录（S.dragUndo）
 *  @param {string} ident            这一串里**最后**拖的那条的 identifier
 *  @param {string[]|null} overrideNow 这一次拖动**之前**的 S.orderOverride
 *  @param {number} at               时间戳（由调用方给 —— 纯函数不读时钟，探针才好验）
 *  @returns {{ident:string, before:string[]|null, at:number}} */
function undoRecordFor(prev, ident, overrideNow, at) {
    const had = !!prev && typeof prev === 'object' && ('before' in prev);
    const before = had ? prev.before : (Array.isArray(overrideNow) && overrideNow.length ? overrideNow.slice() : null);
    return { ident: String(ident), before, at };
}

/** ★B13d 的纯逻辑：撤销这一次拖动 → 该用哪份顺序。
 *  · 没有拖动记录（undo 为空）→ null（"没得撤"，界面给一句人话、什么都不改）；
 *  · `undo.before` 是一份非空数组（拖动前用户自己手调过）→ 原样还回去（**逐位**，不是"大致回原位"）；
 *  · `undo.before` 是 null / 空（拖动前压根没手调过）→ 回到自动顺序（= S.orderOverride 置 null）。
 *  @returns {{override:string[]|null, had:boolean, backToAuto:boolean}|null} */
function undoTargetOf(undo) {
    // ★空对象 / 缺 `before` 键 = 压根没有拖动记录（真记录一定带 before：可能是 null，但键在）→ 没得撤
    if (!undo || typeof undo !== 'object' || !('before' in undo)) return null;
    const before = Array.isArray(undo.before) && undo.before.length ? undo.before.slice() : null;
    return { override: before, had: true, backToAuto: !before };
}
/* ==== ywpu-undo-core:end ==== */

/** ★B13d：撤销拖动 —— 把顺序**逐位回到拖动前的初始位置**（纯逻辑见上，这里只管界面收尾）。 */
function undoDrag() {
    const t = undoTargetOf(S.dragUndo);
    if (!t) { toast('info', '这次没有可以撤销的拖动'); return false; }
    const ident = S.dragUndo.ident;
    S.orderOverride = t.override;
    S.dragUndo = null;
    if (S.view === 'order') renderOrderView(); else renderList();
    renderFoot();
    toast('success', '已撤销拖动：回到拖之前的位置' + (t.backToAuto ? '（自动顺序）' : '（你之前手调过的那份顺序，' + t.override.length + ' 个条目）'));
    console.info('[预设更新器] 撤销拖动', { 条目: ident, 回到: t.backToAuto ? '自动顺序' : ('手调顺序 ' + t.override.length + ' 个条目') });
    return true;
}

/** ★P7（§15）：商店来的这次对比，页顶照实写"这是谁的东西 + 挑完怎么落盘"，并把**包应用时的风险**说人话：
 *  · 没找到这条 / 位置不太确定 / 你已有同名 / id 撞了 → 逐条列出来（不静默）
 *  这就是 §15 的"降级照旧"：包应用有冲突/同名/锚点找不到时，用户在对比页里自己挑。
 *  ★§22：卡片标题 / 用途备注 / 出处挪进上面的**来源块**（`sourceBarHtml`）；这里只留"风险提示"，
 *    两句老文案（"找不到位置（…）——这些没动" / "你已经有同名的了"）**一个字没动**（e2e 钉着它们）。 */
function storeBarHtml() {
    const st = S.store;
    if (!st) return '';
    const r = st.report || null;
    const notes = [];
    if (r) {
        /* ★S2-1（UI P4 + 台账 S2-1）：**"位置待定"这件事现在只在上面那个琥珀块里说**
           （lowConf / unresolved / 内核那句「没找到邻居」已经并进 `anchorTrouble()` 的正文与 title）。
           这里只留**它管不到的两条"同名"** —— 那是另一件事（你已经有同名条目），不是位置问题。
           ⇒ 灰蓝块在"只是位置待定"的场景里**整块不渲染**（省 2 行），信息一条都没丢。 */
        if (r.storeSameName && r.storeSameName.length) notes.push('有 ' + r.storeSameName.length + ' 条你已经有同名的了（' + r.storeSameName.slice(0, 3).map(String).join('、') + (r.storeSameName.length > 3 ? '…' : '') + '）→ 按「改你那条」进对比，你可以选用我的 / 用新版 / 保存为两版');
        if (r.sameName && r.sameName.length) notes.push('有 ' + r.sameName.length + ' 条你已经有同名的了（会照常加一条，你自己删一个）');
    }
    return notes.length
        ? `<div class="ywpu-row ywpu-storebar"><span class="ywpu-note">⚠ ${notes.map(esc).join('<br>⚠ ')}</span></div>`
        : '';
}

/* ==== ywpu-bulk-core:start（纯逻辑，别在这段里引用外面的东西 —— 探针会把这段单独抽出来跑；
   ★这里唯一允许的外部依赖是内核（PM）：探针把**真内核**当参数喂进来，与产品里用的是同一个 PM）==== */
/** ★§BY-I（2026-09-23 · 作者第十七批 · 作者原话）："筛选区最上面加两颗一键按钮：
 *   右侧那颗 = 一键选新版（新增加进来、删掉跟随删除、开关以新为准）；左侧那颗 = 一键选旧版（全部保留我的/旧状态）；
 *   再点一次同一颗 = 取消全选（回到默认态）。"
 *  本函数就是"点一下"的**取值规则**（纯函数：只吃 items + 现有决策，返回新的决策表；不碰 DOM、不碰 S）：
 *   · 只有一方有（新版新增 / 新版删掉）→ 取 source：'next' = 加进来 / 跟随删掉，'mine' = 不要 / 保留我的；
 *   · 两边都有、**正文一字未动**（只有开关不同）→ 只动 enabled：'next' = 保持新状态，'mine' = 还原旧状态；
 *   · 两边都有、正文不同（含"改名"）→ 取 source 整条跟着走；**顺带**把开关也取成同一版（"全部"就是这个意思）；
 *   · 不需要选的条目（两边一样 / 两边都是分隔符）→ **一个都不碰**（跟 runAnalyze 刚算完时一模一样）。
 *  @param {Array} items           S.analysis.items（真内核产物）
 *  @param {Object} decisions      现有决策表（保留了用户逐处挑 / 手改过的文字）
 *  @param {'mine'|'next'} side    'mine' = 一键选旧版 / 'next' = 一键选新版
 *  @returns {Object} key → 新决策（只含**需要动**的那些条目） */
function bulkDecisions(items, decisions, side) {
    const s = side === 'next' ? 'next' : 'mine';
    const out = {};
    for (const it of (items || [])) {
        if (!it || !PM.needsChoice(it)) continue;
        /* ★W14 ①②（作者第 23 批原话："这些只有自己有的东西就不要勾选上，让用户自己选择"）：
           **「只有我有的」（mine 有、新版没有）这颗一键不碰它** —— 并且把上一次的残留选择
           （点过「保留只有我有 / 丢弃只有我有」留下的 source）**清洗回「还没选」**（作者点名：
           "一键选新版/旧版 点击后要把『只有我有的』那部分的选择清洗掉，重置为未选，不留残留"）。
           改前：它跟别的条目一起被写进 `source: s` ⇒ 一键选新版 = **跟随删除**、一键选旧版 = 保留；
           作者要的是两颗都不动它（保留与否让他自己点，见本批新增的那两颗按钮），所以这里直接跳过。 */
        if (it.mine && !it.next) { out[it.key] = { source: null }; continue; }
        const cur = (decisions && decisions[it.key]) || {};
        const both = !!(it.mine && it.next);
        /* ★W17C（作者 2026-09-24 实测报的 BUG）：这里的判据**必须与内核 `itemDecided` 同一个** ——
           `status === SAME && enabledDiff`（正文一字未动、只有开关不同）。
           改前写的是"**正文 diff 为 0** 且没改名"（`it.diff.add/del` 都为 0），而内核判"两边不同"看的是
           **指纹** `entryFp() = [正文, role, injection_position, injection_depth]` ⇒ 差异只落在
           **注入位置 / 注入深度 / 角色**上的条目，正文 diff 天然是 0 ⇒ 被误当成"只有开关不同"那一支
           ⇒ 只写 `enabled`、**不写 `source`** ⇒ 内核 `itemDecided`（这种条目要求 `source`）判它**仍未选**。
           作者原话："我选择了一键选新版 以及选择了保留只有我有 结果发现还有一些条目 两边不同的条目
           它还是没有被勾选…那些条目就是同时有开关变化 同时又有两边不同的那些条目"。
           实测量级（`e2e/tmp/w17c-real-flow.js`，作者本机 11 份真预设两两组合 110 对）：
           **58 对**里有这种条目一键之后仍挂着"待处理"（例：V0811 → 余温V0917 的「🔢字数要求」注入深度 4→2、
           「📃创作契约📃」注入位置有/无）—— 而且这种条目在行里连一颗选项都没有（见 `itemHtml` 的
           `hasDiff || it.renamed` 分支）⇒ 用户"没有办法选择"。 */
        const switchOnly = both && it.status === PM.STATUS.SAME && !!it.enabledDiff;
        if (switchOnly) {                       // 只有开关不同 → 只动开关
            out[it.key] = { ...cur, enabled: s };
            continue;
        }
        out[it.key] = { ...cur, source: s, blockDecision: {}, customText: '', customEdited: false };
        if (both && it.enabledDiff) out[it.key].enabled = s;   // 正文 + 开关都不同 → 一起取这一版
        /* ★W99-甲：**名字那一维也一起落**（"一键全按这一版"本来就是"所有维度都按它"）——
           不补这一句，改完内核判据（名字必选）之后，一键完还会剩一堆"改了名字"的条目挂着「待我处理」
           （作者原话要的是选完就清干净：那个计数得选完才归零）。 */
        if (both && it.renamed) out[it.key].name = s;
    }
    return out;
}

/** ★W17C-2：条目侧那两颗"一键"**现在亮的是哪一颗** —— 从决策表现算（与正则侧 `bulkRxModeOf()` 同一套思路：
 *  不另存状态位）。为什么必须现算：这个高亮原来存在 `S.bulkSide` 里，而决策表在很多条路上会被重写 ——
 *  逐条点 `用我的/保存为两版/用新版/还原旧状态`、批量条那两颗「用我的/用新版」、换基准后的重算
 *  （`recomputeWithBase` + `analyzeRegexesIntoState`）—— **那些路都不会去动这个状态位** ⇒ 高亮会说谎
 *  （作者在正则侧实测报的"取消后高亮不灭"就是这一族；条目侧同根因，本批一起收）。
 *  口径（三条同时成立才算"现在全部是这一版"）：
 *   ① 只看**这一键管得着的**条目：内核 `needsChoice` 且**不是「只有我有的」**
 *      （那批归旁边两颗「保留/丢弃只有我有」，`bulkDecisions` 也是直接跳过它们）；
 *   ② 逐条取值落在**同一侧**：正文一字未动、只有开关不同的那条看 `enabled`（行里那两颗写的是它），
 *      其余看 `source`（与 `bulkDecisions` 的写法逐条对应）；
 *   ③ **默认态不会误亮**：需要拍板的条目在 `runAnalyze` 里一律是 `{source:null}`（没有 `enabled`）
 *      ⇒ 谁都没点过时两边计数都是 0 ⇒ 返回 null（这一条跟正则侧不同：正则的兜底值自带 `use`，
 *      所以那边还得额外看 `touched`；条目侧不需要，这是 `defaultDecisions` 的写法决定的）。
 *  @param {Array} items S.analysis.items（真内核产物）
 *  @param {Object} decisions S.decisions
 *  @returns {'mine'|'next'|null} null = 没形成统一态（高亮不亮；这时点那一颗 = 按那一版定，**不是**取消） */
function bulkSideModeOf(items, decisions) {
    const arr = (items || []).filter(it => it && PM.needsChoice(it) && !(it.mine && !it.next));
    if (!arr.length) return null;
    let mine = 0, next = 0;
    for (const it of arr) {
        const d = (decisions || {})[it.key] || {};
        const switchOnly = !!(it.mine && it.next && it.status === PM.STATUS.SAME && it.enabledDiff);
        const v = switchOnly ? d.enabled : d.source;
        if (v === 'mine') mine++; else if (v === 'next') next++;
    }
    if (mine === arr.length) return 'mine';
    if (next === arr.length) return 'next';
    return null;
}

/* ---- ★W14 ②③：**「只有我有的」那两颗按钮**（放在「一键选新版」右边）----
   作者原话："新增两颗按钮…『保留只有我有』：点击 ⇒ 把所有"只有我有的"整条勾上（保留我的）；
   再点一次 ⇒ 取消（回到未选）。『丢弃只有我有』：点击 ⇒ 把所有"只有我有的"选成"不要"；再点一次 ⇒ 取消。
   两颗都只作用于"只有我有的"那些条目（不许波及其它类别）。"
   · 语义与条目行里那对 `保留 / 不要` **一字不差**（`pickPill`：mineOnly 且 source='mine' → 保留；'next' → 不要）；
   · **高亮不另存状态**：从决策表现算（`mineOnlyModeOf`）⇒ 用户手工改一条之后高亮自己就灭，**不会残留高亮**。 */
/** 本次"一键"要照顾的那批：内核产物里"你这份有、新版没有"的条目（= 界面上的「只有我有」）。
 *  @param {Array} items S.analysis.items（真内核产物）
 *  @returns {Array} 只含"只有我有的"那些（别的类别一条都不进） */
function mineOnlyItems(items) {
    return (items || []).filter(it => it && it.mine && !it.next);
}
/** 「保留只有我有」/「丢弃只有我有」的取值规则（纯函数：只吃 items + 现有决策，返回新决策表；不碰 DOM、不碰 S）。
 *  @param {Array} items      S.analysis.items
 *  @param {Object} decisions 现有决策表
 *  @param {'keep'|'drop'|null} mode 'keep' = 保留（source:'mine'）/ 'drop' = 丢弃（source:'next'）/ null = 取消（回"还没选"）
 *  @returns {Object} key → 新决策（**只含"只有我有的"那些**；其它类别一个都不写） */
function mineOnlyDecisions(items, decisions, mode) {
    const out = {};
    for (const it of mineOnlyItems(items)) {
        const cur = (decisions && decisions[it.key]) || {};
        const source = mode === 'keep' ? 'mine' : (mode === 'drop' ? 'next' : null);
        out[it.key] = { ...cur, source, blockDecision: {}, customText: '', customEdited: false };
    }
    return out;
}
/** 这两颗按钮**现在是不是亮着**（从决策表算，不另存状态 —— 用户手工改一条 ⇒ 自动灭，不会残留高亮）。
 *  @returns {'keep'|'drop'|null} 全部保留 ⇒ 'keep'；全部丢弃 ⇒ 'drop'；其余（未选 / 只选了一部分）⇒ null */
function mineOnlyModeOf(items, decisions) {
    const arr = mineOnlyItems(items);
    if (!arr.length) return null;
    let keep = 0, drop = 0;
    for (const it of arr) {
        const src = ((decisions || {})[it.key] || {}).source || null;
        if (src === 'mine') keep++; else if (src === 'next') drop++;
    }
    if (keep === arr.length) return 'keep';
    if (drop === arr.length) return 'drop';
    return null;
}

/** ★§BY-I：**取消全选 = 回到默认态**。默认态 = 刚点完「开始对比」时那份（runAnalyze 算出来的）：
 *   需要选的条目 → {source:null}（= 还没选、待处理）；不需要选的 → 内核兜底值（跟新版）。
 *  作者原话："再点一次同一颗 = 取消全选（回到默认态）" —— 默认态就是这一份，不是"再点一下全反选"。 */
function defaultDecisions(items) {
    const out = {};
    for (const it of (items || [])) {
        if (!it) continue;
        out[it.key] = PM.needsChoice(it) ? { source: null } : PM.fallbackDecision(it);
    }
    return out;
}

/* ---- ★Wave W2 ①：**正则侧的两颗"一键"**（与上面条目侧那两颗同一个"取值规则 + 取消全选"口径）----
   为什么口径不能直接照抄条目侧的 `bulkDecisions`：两边**内核决策的形状不同** ——
   条目侧写 `{source:'mine'|'next'|'both'}`，正则侧写 `{use:'mine'|'next'|'both', enabled:'mine'|'next'}`
   （见内核 `mergeRegexes` 的那段注释）。所以这里按"同一套语义"重写一遍取值规则，
   逐条对应关系写在各支的注释里；**界面/文案/确认框全部复用条目侧那一套**（作者要的"逻辑 copy 下来"）。 */
/** 正则侧的"一键"取值规则（纯函数：只吃 items + 现有决策，返回新决策表；不碰 DOM、不碰 S）：
 *  · 「只有我有」（新版里没有它）→ `use`：'mine' = 保留 / 'next' = 不要（= 删掉，与那颗按钮一字不差）；
 *  · 「新版新增」→ `use`：'next' = 加进来 / 'mine' = 不要；
 *  · **正文一字未动、只有开关不同** → 只动 `enabled`：'mine' = 还原旧状态 / 'next' = 保持新状态
 *    （★这一支跟条目侧**有意不同**的地方见内核 `fallbackRegexDecision` 的注释：正则的开关会直接改变
 *      模型读到/发出的文本，所以"默认保你的"；这里用户是**主动**点的一键，就按他点的那一版写）；
 *  · 其余（两边内容不同 / 只改了名字）→ `use` 整条跟着走，**顺带**把 `enabled` 也取成同一版（"全部"就是这个意思）；
 *  · 不需要选的（两边完全一样）→ **一个都不碰**。 */
function bulkRegexDecisions(items, decisions, side) {
    const s = side === 'next' ? 'next' : 'mine';
    const out = {};
    const mineOnlyRxKeys = [];                 // ★W14 ①：被排除的"只有我有的"（调用方据此清 regexTouched）
    out.__mineOnlyRxKeys = mineOnlyRxKeys;     // （挂在返回值上，不改这个函数的调用签名）
    for (const it of (items || [])) {
        if (!it || !PM.regexNeedsChoice(it)) continue;
        /* ★W14 ①（与条目侧同一条纪律，见 `bulkDecisions` 里那段）：**「只有我有的」正则一键不碰**，
           并且把残留选择清洗掉 —— 由调用方 `bulkRxApplyNow` 把它从 `S.regexTouched` 里摘掉、决策回内核兜底值
           （正则这边的"还没选"记在"你亲手点过"那份名单上，跟条目侧 `{source:null}` 是同一件事的两种记法）。 */
        if (it.kind === 'mineOnly') { mineOnlyRxKeys.push(it.key); continue; }
        const cur = (decisions && decisions[it.key]) || {};
        const switchOnly = it.status === PM.STATUS.SAME && !!it.disabledDiff && !!it.mine && !!it.next;
        if (switchOnly) { out[it.key] = { ...cur, enabled: s }; continue; }
        out[it.key] = { ...cur, use: s, enabled: s };
        /* ★★W111-④（派单第 3 条"一键四颗在正则包上点下去要真的管正则，验一遍"验出来的缺口；
           作者原话："能不能统一啊 统一控制啊"）：**名字那一维也一起落** —— 与条目侧 `bulkDecisions()`
           里 W99-甲 那一句**逐字同一条纪律**（"一键全按这一版"本来就是"所有维度都按它"）。
           不补这一句：内核 `regexItemDecided()`（W99-甲 起就要求 `nameChanged` 的行必须有 `d.name`）
           ⇒ 点完一键，**凡是改了名字的正则还挂着「待我处理」**（W111 实测：8 条要选 → 点完剩 1 条，
           恰恰就是改了名字那条；同结构的一键在条目侧点完是 0 条）—— 正是作者 W17C 为条目报过的
           "一键之后还有一些条目没被勾选"，正则这半当年漏了镜像。 */
        if (it.nameChanged) out[it.key].name = s;
    }
    return out;
}
/* ---- ★W14 ②③：正则侧的「保留只有我有 / 丢弃只有我有」（与条目侧同一套语义，走同一个渲染器）---- */
/** 正则里"只有我有"的那批（内核给它们 `kind:'mineOnly'`）。 */
function mineOnlyRxItems(items) {
    return (items || []).filter(it => it && it.kind === 'mineOnly');
}
/** 正则侧两颗按钮的取值规则。形状与条目侧不同（正则写 `use`），语义逐一对应：
 *  'keep' = 保留（`use:'mine'`，与行里那颗「保留」一字不差）/ 'drop' = 不要（`use:'next'`）/ null = 取消。
 *  ★"取消"在正则侧 = **把这一条从决策表里整个摘掉**（= 回到"还没选"，与内核对未选条目走兜底值同一条纪律）
 *    + 把那一条从"亲手点过"名单里摘掉（一键的"会丢多少活儿"那份读数还在用它）。
 *    ★W99-丙：改前这一支写的是"回内核兜底值"（`fallbackRegexDecision`）—— 那是**默认预选**，
 *    作者本轮明确否掉（"不要默认"）；现在整个决策表一开始就是空的，"取消"= 回到那个状态。 */
function mineOnlyRxDecisions(items, decisions, mode) {
    const out = {};
    for (const it of mineOnlyRxItems(items)) {
        const cur = (decisions && decisions[it.key]) || {};
        if (mode === 'keep') out[it.key] = { ...cur, use: 'mine' };
        else if (mode === 'drop') out[it.key] = { ...cur, use: 'next' };
        else out[it.key] = null;                   // ★取消：本函数返回值上的 null = 调用方把它删掉（见两个调用方）
    }
    return out;
}
/** 正则侧这两颗按钮现在亮不亮（★必须看"亲手点过"名单：内核给的兜底值本身就是"保留"，
 *  不看她的话一进页面就会误判成"用户点过保留"。与 `regexFilterUI().rx.pending` 是同一个判据）。 */
function mineOnlyRxModeOf(items, decisions, touched) {
    const arr = mineOnlyRxItems(items);
    if (!arr.length) return null;
    let keep = 0, drop = 0;
    for (const it of arr) {
        /* ★W99-丙：判据从"亲手点过名单"换成**决策表本身**（`use` 有值 = 这条真定过）——
           预填去掉之后，两者本来就等价；用决策表更直接（一键/逐条点/取消 三条路都只写它）。 */
        const u = ((decisions || {})[it.key] || {}).use || null;
        if (u === 'mine') keep++; else if (u === 'next') drop++;
        else return null;                                      // 还有没定过的 ⇒ 没形成统一态
    }
    if (keep === arr.length) return 'keep';
    if (drop === arr.length) return 'drop';
    return null;
}

/** ★W17C（作者 2026-09-24 实测报的 BUG）：正则那两颗"一键"**现在亮的是哪一颗** —— 从决策表现算，
 *  与上面那两颗（`mineOnlyRxModeOf`）同一个手法：**不另存状态位**。
 *  为什么必须现算：这个高亮原来读的是 `S.regexBulkSide`（一个状态位），而决策表在很多条路上会被重写 ——
 *  逐行点「用我的/两条都留/用新版」（`renderRegexBox` 里那几支）+ 换基准后的重算
 *  （`analyzeRegexesIntoState`，见 6383/6620/6668 那几处）—— **那些路都不会去动这个状态位** ⇒
 *  高亮会"说谎"：已经逐条改回来了，那颗按钮还亮着（作者原话："我取消 再点击一次一键选新版
 *  它居然还是处的那个一键选新版里面"）。现算之后，高亮**恒等于**"决策表现在真的全在那一版"。
 *  口径（三条同时成立才算"现在全在那一版"）：
 *   ① 每条**这一键管得着的**正则都**亲手定过**（`touched`）—— 正则的兜底值本身就带 `use`，
 *      不看她就一进页面误判成"用户点过"（与 `mineOnlyRxModeOf` / `regexFilterUI().rx.pending` 同一条纪律）；
 *   ② 逐条的取值落在**同一侧**：正文一字未动、只有开关不同的那条看 `enabled`（行里那两颗写的是它），
 *      其余看 `use`（与 `bulkRegexDecisions` 的写法逐条对应）；
 *   ③ **「只有我有的」那批不参与**（它们归旁边那两颗「保留/丢弃只有我有」；`bulkRegexDecisions` 也是直接跳过它们）。
 *  @param {Array} items S.regexItems（内核 product）
 *  @param {Object} decisions S.regexDecisions
 *  @param {Object} touched S.regexTouched（"你亲手点过"那份名单）
 *  @returns {'mine'|'next'|null} null = 没形成统一态（高亮不亮；这时点那一颗 = 按那一版定，**不是**取消） */
function bulkRxModeOf(items, decisions, touched) {
    const arr = (items || []).filter(it => it && PM.regexNeedsChoice(it) && it.kind !== 'mineOnly');
    if (!arr.length) return null;
    let mine = 0, next = 0;
    for (const it of arr) {
        const d = (decisions || {})[it.key] || {};
        const switchOnly = it.status === PM.STATUS.SAME && !!it.disabledDiff && !!it.mine && !!it.next;
        /* ★W99-丙：判据从"亲手点过名单"换成**决策表本身**（与 `mineOnlyRxModeOf` / `regexFilterUI().rx.pending`
           同一个口径 —— 预填去掉之后，"点过"与"有值"本来就是同一件事）。名字那一维不参与"全在旧版/新版"的
           判定（这一键管的是内容与开关；名字是独立的一维）。 */
        const v = switchOnly ? d.enabled : d.use;
        if (v === 'mine') mine++; else if (v === 'next') next++;
        else return null;                                     // 还有没定过的 ⇒ 没形成统一态
    }
    if (mine === arr.length) return 'mine';
    if (next === arr.length) return 'next';
    return null;
}

/** 正则侧"取消全选 = 回到默认态"。★W99-丙：默认态 = **还没选**（决策表一条都没有）——
 *  与条目侧 `defaultDecisions()` 给成对条目写 `{source:null}`、与 `analyzeRegexesIntoState()` 一进页面
 *  写的那份**逐字一致**；作者原话："我不是说不要默认有选择吗？……不要默认"。
 *  （改前这里返回的是"内核兜底值"预填 —— 那就是默认预选；作者否掉的就是它。） */
function defaultRegexDecisions(items) {
    return {};
}
/* ==== ywpu-bulk-core:end ==== */

/** ★A2（文案评审 M-02 · 2026-09-23）：点"一键"之前先数一数**会丢多少活儿**。
 *  一键按的新值是 `bulkDecisions`（它把每条的 `blockDecision/customText/customEdited` 一律清空）⇒
 *  · `picked` = 你已经逐处挑过的条数：这条的选择跟"默认态"不一样（选了边、单独动过开关、或逐处点过）；
 *  · `edited` = 你**手改过文字**的条数（`customEdited` / 有 `customText`）—— 一键之后那几个字就没了。
 *  ★"再点一次同一颗"只是回到"还没选"，**不是**还原到你点之前的样子（`defaultDecisions`）——
 *    所以这一层确认框是**必需的**：不可撤销的动作不能悄悄的做。 */
function bulkLossOf(items, decisions) {
    const dflt = defaultDecisions(items);
    let picked = 0, edited = 0;
    for (const it of (items || [])) {
        if (!it) continue;
        const cur = (decisions || {})[it.key] || {};
        const d = dflt[it.key] || {};
        if ((cur.source || null) !== (d.source || null) || cur.enabled !== d.enabled
            || Object.keys(cur.blockDecision || {}).length) picked++;
        if (cur.customEdited || (typeof cur.customText === 'string' && cur.customText)) edited++;
    }
    return { picked, edited };
}

/** ★§BY-I：点一颗"一键"按钮（'mine' = 左侧那颗旧版 / 'next' = 右侧那颗新版）。
 *  · 第一次点：全部条目按这一版定下来（取值规则见 bulkDecisions）；
 *  · **再点同一颗 = 取消全选**：每条回到"还没选"的默认态（按钮的高亮也跟着灭）—— **不是还原**；
 *  · 点**另外**那颗 = 直接换边（不等于取消）。
 *  范围 = **全部条目**（不看当前筛选 —— 按钮自己写着"一键全选"，title 里也写明了）；
 *  它**不写盘**：只是把逐条的选择摆好，用户还能逐条改，最后点「生成新预设」才落盘。
 *  ★A2（2026-09-23）：真到"会丢东西"的时候（有逐处选择 / 有手改文字）**先弹一次确认**再说 —— 见 `bulkLossOf`。 */
/** ★★W103-戊（作者 2026-10-06 原话："既然上面关于预设的内容的按键**只控制预设**，为什么不让它**控制所有**？"）：
 *  这四颗"一键"（条目那排的两颗 + 正则那排的两颗）现在**统一管两摊** —— 条目决策 + 正则决策一起定。
 *  · 取消那一支的判据 = `sideModeAllNow()`（两摊都落在这一版才算"再点同一颗 = 取消"）；
 *  · 确认框 / 提示语把两摊的"会丢什么"一起说（正则那摊的读数复用 `bulkRxLossOf`）；
 *  · 实现 = 两摊各有一个"落地核心"（`bulkItemsApplyCore` / `bulkRxApplyCore`），
 *    两排按钮调的都是同一支 `bulkApply` ⇒ 高亮、取消、确认框口径天然一致（不新造第二套语义）。 */
function bulkApply(side) {
    const an = S.analysis;
    if (!an || !(an.items || []).length) { toast('warning', '先点「开始对比」跑出结果再用这颗按钮'); return; }
    const s = side === 'next' ? 'next' : 'mine';
    if (sideModeAllNow(s)) {                                 // ★再点同一颗 = 取消全选（回到默认态，**两摊一起**）
        S.decisions = defaultDecisions(an.items);            // 这一步已经把"只有我有的"一起清回"还没选"了
        S.keepVisible = {};
        S.regexDecisions = defaultRegexDecisions(S.regexItems || []);   // ★W103：正则那摊也回"还没选"
        S.regexTouched = {};
        S.regexPos = null;
        renderResult(); renderFoot();
        toast('info', '已全部取消选择：条目与正则每条都回到「还没选」，按钮的高亮也灭了'
            + '（★这不是还原：你逐处挑过的选择、手改过的文字都不会回来）');
        return;
    }
    const loss = bulkLossOf(an.items, S.decisions);
    const lossRx = bulkRxLossOf(S.regexItems || [], S.regexDecisions, S.regexTouched, S.regexPlace);
    if (loss.picked || loss.edited || lossRx.picked || lossRx.moved) {   // ★先问一次：说清会丢什么、说清不可撤销
        askYes('一键全部按' + (s === 'mine' ? '旧版' : '新版') + '？', [
            '条目这边：你已经逐处挑过 **' + loss.picked + '** 条' + (loss.edited ? '，其中 **' + loss.edited + '** 条你手改过文字' : '') + '。',
            ...(lossRx.picked || lossRx.moved ? ['正则这边：你已经挑过 / 亲手点过 **' + lossRx.picked + '** 条'
                + (lossRx.moved ? '，其中 **' + lossRx.moved + '** 条你手选过「插在哪一条后面」' : '') + '。'] : []),
            '点「确定」：**全部 ' + an.items.length + ' 条**' + (lossRx.picked || lossRx.moved ? ' + 全部正则' : '')
            + '都按' + (s === 'mine' ? '旧版' : '新版') + '覆盖 —— 你逐处挑的选择会被改掉、手改的字会没（**不可撤销**）。',
            '点「算了」：什么都不做，你的选择原样留着。',
        ], { ok: '全部按' + (s === 'mine' ? '旧版' : '新版'), cancel: '算了' }).then(ok => {
            if (ok) bulkApplyNow(s);
            else toast('info', '没有动：你的选择原样留着');
        });
        return;
    }
    bulkApplyNow(s);
}
/** 条目那摊的"落地"核心（不弹提示、不重绘；返回本次动了哪几条 —— 调用方的提示与确认框读数用它）。 */
function bulkItemsApplyCore(s) {
    const an = S.analysis;
    if (!an || !(an.items || []).length) return { n: 0, diff: 0 };
    const next = bulkDecisions(an.items, S.decisions, s);
    const keys = Object.keys(next);
    let nDiff = 0;
    for (const k of keys) {                                  // 只有真的变了的才算"动了"（给读数用）
        const a = S.decisions[k] || {}, b = next[k];
        if (a.source !== b.source || a.enabled !== b.enabled) nDiff++;
        S.keepVisible[k] = true;
    }
    S.decisions = { ...S.decisions, ...next };
    /* ★W17C-2：这里**不再**写 `S.bulkSide` —— 那颗按钮亮不亮由 `bulkSideModeOf()` 从决策表现算
       （点完这一下，这批条目都被定到这一版 ⇒ 高亮自然亮起来，不靠状态位）。 */
    /* ★W14 ②③：两颗新按钮的高亮是**从决策表现算**的（`mineOnlyModeOf`）⇒ 上面刚把"只有我有的"
       清回"还没选"，这一次重绘之后它们自己就灭了。不用再动任何状态位（也就不会残留）。 */
    return { n: keys.length, diff: nDiff };
}
/** ★W103-戊：正则那摊的"落地"核心（同上；`__mineOnlyRxKeys` 那几条的清洗口径见 `bulkRxApplyNow` 原注释）。 */
function bulkRxApplyCore(s) {
    const items = S.regexItems || [];
    if (!items.length) return { n: 0, diff: 0 };
    const next = bulkRegexDecisions(items, S.regexDecisions, s);
    const keys = Object.keys(next);
    let nDiff = 0;
    const t = { ...(S.regexTouched || {}) };
    for (const k of keys) {                                  // 只有真的变了的才算"动了"（给读数用）
        const a = S.regexDecisions[k] || {}, b = next[k];
        if (a.use !== b.use || a.enabled !== b.enabled || a.name !== b.name) nDiff++;
        t[k] = true;                                         // 与条目侧 `keepVisible` 同族：这一批不再算"要你看"
    }
    const dfltRx = mineOnlyRxDecisions(items, S.regexDecisions, null);
    for (const k of (next.__mineOnlyRxKeys || [])) { delete t[k]; }
    delete next.__mineOnlyRxKeys;                            // 别把内部用的键写进决策表
    const merged = { ...S.regexDecisions, ...next };
    for (const [k, v] of Object.entries(dfltRx)) { if (v === null) delete merged[k]; else merged[k] = v; }
    S.regexDecisions = merged;
    S.regexTouched = t;
    S.regexPos = null;                                       // 决策变了 ⇒ 位次表重算（签名也会失效，这里显式清更稳）
    return { n: keys.length, diff: nDiff };
}
/** ★W103-戊：那两颗"一键"**现在是不是亮着**（管两摊）：
 *  条目全在这一版（`bulkSideModeOf`）**并且**正则那摊也都定在这一版（`bulkRxModeOf`）；
 *  正则这摊要是**没有要选的行**（没有正则 / 全是"两边一样"）⇒ 不参与判定
 *  （不然"只改条目"那种包永远点不亮那颗按钮）。 */
function sideModeAllNow(s) {
    const an = S.analysis;
    const items = an ? (an.items || []) : [];
    const rxs = S.regexItems || [];
    /* ★★W111-⑤（派单第 3 条"一键四颗在正则包上点下去要真的管正则（W103 的口径），验一遍"验出来的缺口）：
       这条判据**每半摊各自只在"它真有要选的"时才参与** —— 与下面正则那半的写法（rxNeeds）对齐。
       改前：条目这半把 `bulkSideModeOf()` 的空集返回值（null）当作"没统一" ⇒ **正则包**（条目一条都不用选）
       时整支恒 false ⇒ ① 那两颗"一键"**点了永远不亮**（用户看不出点没点上）；
       ② 再点同一颗**取消不掉**（第二下变成又按一遍）—— 两条都与条目包上的手感不一致（作者要的"统一控制"）。
       ★"有一摊要选就那一摊必须统一"的老口径一个字没动；两摊都没要选的 ⇒ 照旧 false（不许误亮高亮）。 */
    const itemsNeed = items.some(it => it && PM.needsChoice(it) && !(it.mine && !it.next));
    const rxNeeds = rxs.some(it => it && PM.regexNeedsChoice(it) && it.kind !== 'mineOnly');
    if (!itemsNeed && !rxNeeds) return false;
    if (itemsNeed && bulkSideModeOf(items, S.decisions) !== s) return false;
    if (!rxNeeds) return true;
    return bulkRxModeOf(rxs, S.regexDecisions, S.regexTouched) === s;
}
/** 真正落地的动作（确认框之后复用同一段；`bulkApply` 的注释在上面）—— ★W103：两摊一起落、一次重绘。 */
function bulkApplyNow(s) {
    const it = bulkItemsApplyCore(s);
    const rx = bulkRxApplyCore(s);
    renderResult(); renderFoot();
    const parts = [];
    if (it.n) parts.push('条目 ' + it.n + ' 条');
    if (rxItemsN()) parts.push('正则 ' + rx.n + ' 条');
    toast('success', (s === 'next' ? '全部按新版定了' : '全部按你的（旧版）定了')
        + '：' + (parts.length ? parts.join(' · ') : '没有要定')
        + ((it.diff === it.n && rx.diff === rx.n) ? '' : '（其中条目 ' + it.diff + ' 条有变化）')
        + ' —— 还能逐条改，最后点「生成新预设」才写盘');
    console.info('[预设更新器] 一键' + (s === 'next' ? '选新版' : '选旧版'),
        { 条目覆盖: it.n, 条目有变化: it.diff, 正则覆盖: rx.n, 正则有变化: rx.diff, 待处理: PM.pendingCount((S.analysis || {}).items || [], S.decisions) });
}
/** 这次对比里有没有正则要你看（提示语里"正则 N 条"要不要说，靠它） */
function rxItemsN() { return (S.regexItems || []).length; }

/** ★W14 ②③：点「保留只有我有」/「丢弃只有我有」（作者第 23 批）。
 *  · 点一次 = 把那批「只有我有的」**整条**按这颗的意思定下来（保留 = source:'mine' / 丢弃 = source:'next'）；
 *  · **再点同一颗 = 取消**（回到"还没选"，不是反选）—— 判据是"现在还亮着吗"（`mineOnlyModeOf`）；
 *  · **只作用于「只有我有的」**，其它类别一个都不碰（`mineOnlyDecisions` 只遍历那批）；
 *  · 范围 = 全部条目（不看当前筛选），与那两颗"一键"同一条口径；不写盘，最后点「生成新预设」才落盘。 */
/** ★W103-戊：两颗「保留 / 丢弃只有我有」**现在是不是亮着**（管两摊 —— 条目侧 `mineOnlyModeOf` + 正则侧 `mineOnlyRxModeOf`）。
 *  某一摊没有"只有我有的" ⇒ 那一摊不参与判定；两摊都在同一档 ⇒ 返回那一档；否则 null。 */
function mineOnlyModeAllNow() {
    const an = S.analysis;
    const items = an ? (an.items || []) : [];
    const mi = mineOnlyItems(items);
    const mr = mineOnlyRxItems(S.regexItems || []);
    if (!mi.length && !mr.length) return null;
    const a = mi.length ? mineOnlyModeOf(items, S.decisions) : null;
    const b = mr.length ? mineOnlyRxModeOf(S.regexItems || [], S.regexDecisions, S.regexTouched) : null;
    if (mi.length && a === null) return null;
    if (mr.length && b === null) return null;
    const vals = [a, b].filter(v => v !== null);
    return (vals.length && vals.every(v => v === vals[0])) ? vals[0] : null;
}
/** ★W103-戊：正则那摊「只有我有」的"落地"核心（`target` 同上：'keep' / 'drop' / null = 取消）。
 *  口径与 `mineOnlyRxApply` 原注释逐字相同（取消 = 从决策表里整个删掉 + 摘掉"亲手点过"名单）。 */
function mineOnlyRxApplyCore(target) {
    const items = S.regexItems || [];
    const arr = mineOnlyRxItems(items);
    if (!arr.length) return { n: 0 };
    const next = mineOnlyRxDecisions(items, S.regexDecisions, target);
    const t = { ...(S.regexTouched || {}) };
    for (const it of arr) { if (target) t[it.key] = true; else delete t[it.key]; }
    const merged = { ...S.regexDecisions, ...next };
    for (const [k, v] of Object.entries(next)) { if (v === null) delete merged[k]; }
    S.regexDecisions = merged;
    S.regexTouched = t;
    S.regexPos = null;
    return { n: arr.length };
}
/** ★W14 ②③ + ★W103-戊：点「保留只有我有」/「丢弃只有我有」（作者第 23 批；W103 起**管两摊**）。
 *  · 点一次 = 把两摊的「只有我有的」**整条**按这颗的意思定下来（保留 = source/use:'mine' / 丢弃 = 'next'）；
 *  · **再点同一颗 = 取消**（回到"还没选"，不是反选）—— 判据是"现在还亮着吗"（`mineOnlyModeAllNow`）；
 *  · **只作用于「只有我有的」**，其它类别一个都不碰；
 *  · 范围 = 全部（不看当前筛选），与那两颗"一键"同一条口径；不写盘，最后点「生成新预设」才落盘。 */
function mineOnlyApply(mode) {
    const an = S.analysis;
    if (!an || !(an.items || []).length) { toast('warning', '先点「开始对比」跑出结果再用这颗按钮'); return; }
    const arr = mineOnlyItems(an.items);
    const arrRx = mineOnlyRxItems(S.regexItems || []);
    if (!arr.length && !arrRx.length) { toast('info', '这个包里没有「只有我有」的条目 —— 这颗按钮不用点'); return; }
    const now = mineOnlyModeAllNow();
    const target = (now === mode) ? null : mode;                  // ★再点同一颗 = 取消（回到未选）
    const next = mineOnlyDecisions(an.items, S.decisions, target);
    for (const k of Object.keys(next)) S.keepVisible[k] = true;   // 与"一键"同款：处理过的留在原位
    S.decisions = { ...S.decisions, ...next };
    const rx = mineOnlyRxApplyCore(target);                       // ★W103：正则那摊一起
    renderResult(); renderFoot();
    const word = mode === 'keep' ? '保留' : '丢弃';
    const nAll = arr.length + rx.n;
    toast(target ? 'success' : 'info', target
        ? '「只有我有」的 ' + nAll + ' 条已全部**' + word + '**'
            + (rx.n ? '（条目 ' + arr.length + ' 条 · 正则 ' + rx.n + ' 条）' : '（只动了这几条）')
            + ' —— 还能逐条改，最后点「生成新预设」才写盘'
        : '已取消：那 ' + nAll + ' 条「只有我有」的又回到「还没选」了');
    console.info('[预设更新器] ' + (target ? word + '只有我有' : '取消只有我有'),
        { 条目: arr.length, 正则: rx.n, 模式: target || null, 待处理: PM.pendingCount(an.items, S.decisions) });
}

/* ================================================================ ★Wave W2 ①：**正则侧的两颗"一键"**
   （作者第 20 批原话："你就不能像前边的那个条目一样…一键选旧版 一键选新版…就是直接把它 copy 下来不就好了吗，
    它的逻辑呀，全部逻辑 copy 下来"）
   ★安全（主 Agent 转述作者此前的担心："会覆盖已挑选择"）：**与条目侧一字不差的同一套确认逻辑** ——
     只要"你已经挑过 / 亲手点过 / 手选过插入点"，先弹 `askYes` 说清会丢什么、说清不可撤销，
     **绝不静默清掉**用户的选择。确认框组件、话术结构、"算了/确定"两颗按钮的语义全部复用条目侧那一套。
   回滚法：删掉本节 + `REGEX_FILTER_UI.bulk` 那一项 ⇒ 回到"正则那排只有一颗老 chip"。
   ★W17C 改过的一处：取消那一支的判据从"状态位 `S.regexBulkSide`"改成**现算**（`bulkRxModeOf`）。 */

/** 点"一键"之前先数一数**会丢多少活儿**（与条目侧 `bulkLossOf` 同一套口径，只是正则这边没有"手改文字"这一维）：
 *  · `picked` = 这条的选择跟**默认态**不一样（`use`/`enabled` 与内核兜底值不同），**或**你亲手点过这一行
 *    （`S.regexTouched`，Wave G ④ 记的那一份）；
 *  · `moved`  = 你手选过「插在哪一条正则后面」（`S.regexPlace`）—— 一键按新版会把它清掉（那条已经不在原地）。 */
function bulkRxLossOf(items, decisions, touched, place) {
    const dflt = defaultRegexDecisions(items);
    let picked = 0, moved = 0;
    for (const it of (items || [])) {
        if (!it) continue;
        const cur = (decisions || {})[it.key] || {};
        const d = dflt[it.key] || {};
        if (String(cur.use || '') !== String(d.use || '') || String(cur.enabled || '') !== String(d.enabled || '')
            || !!(touched || {})[it.key]) picked++;
        if ((place || {})[it.key]) moved++;
    }
    return { picked, moved };
}

/** ★Wave W2 ①：点正则那排的一颗"一键"（'mine' = 左颗旧版 / 'next' = 右颗新版）。口径逐条照条目侧：
 *  · 第一次点：**全部正则**按这一版定下来（取值规则见 `bulkRegexDecisions`）；
 *  · **再点同一颗 = 取消全选**：每条回到内核兜底值（"还没选"的默认态），高亮也灭 —— **不是还原**；
 *  · 点**另外**那颗 = 直接换边；
 *  · 范围 = **全部正则**（不看当前筛选）；**只管正则**，条目与全局参数一个字不动；
 *  · 会丢东西（有逐条挑过的 / 亲手点过的 / 手选过插入点的）⇒ **先弹一次确认**。 */
function bulkRxApply(side) {
    /* ★★W103-戊：正则那排这两颗**并到"管全部"那条路** —— 作者原话"既然它控制了所有"。
       两排按钮同一个行为、同一套确认框与取消口径（`bulkApply` 里有它自己的注释）。 */
    return bulkApply(side);
}
/** ★W14 ②③：正则侧那两颗新按钮（与条目侧 `mineOnlyApply` 同一套语义；"取消"额外要把
 *  `S.regexTouched` 里那批摘掉 —— 那份名单还给"会丢多少活儿"的读数用）。 */
function mineOnlyRxApply(mode) {
    /* ★★W103-戊：正则那排这两颗并到"管全部"那条路（与条目侧那两颗逐字同一个行为）。 */
    return mineOnlyApply(mode);
}

/** ★W103-戊：正则那摊的"落地"实现现在只有一处 = `bulkRxApplyCore()`（见 `bulkApply` 那一段）。
 *  这支留作**兼容壳**：老探针（`bulk-decided-repro.js` 等）直接调它时，行为与改前一致
 *  —— 只落正则那摊 + 重绘正则块 + 一条提示（不碰条目那摊）。 */
function bulkRxApplyNow(s) {
    const rx = bulkRxApplyCore(s);
    renderRegexBox($el('#ywpu-params'));
    toast('success', '正则全部按' + (s === 'next' ? '新版' : '你的（旧版）') + '定了：' + rx.n + ' 条 —— 最后点「生成新预设」才写盘');
    return rx;
}

/* ==== ywpu-hidden-note-core:start ==== */   // ★这一段会被 e2e/tmp/w94/w94-probe.js 按标记抽出来真编译（口径 = 真实产品代码）
/* ★这一段里**不许引用外面的东西**（PM / S / DOM 一律当参数进来）—— 与 `ywpu-store-core` 同一条纪律。
   ★★W99-己（2026-10-06 · 作者实测原话）："咱们不是关于隐藏条目 **我们已经不让用户进行迷惑、也不让用户
   进行处理**吗？那为什么在上面……有一个**展开那个标题**吗，然后下面还有一个'有几条隐藏条目不在顺序里、
   对比表里也看不到这次会变'然后这一段巴拉巴拉的 —— **这是不是没必要显示出来呀**？"
   ⇒ **这一段现在产品里一个字都不渲染**（唯一的渲染方 `noticesHtml()` 已整块删除，见下面的 W99 备注）。
   判断（按派单要求"先读 W94 的实现判断哪种成立"，逐条给理由）：
     · W94 那套点名管三种情形：`changed`（两边都隐藏、指纹不同）/`dropped`（只有我有）/`added`（只有新版有）；
     · **`changed` / `added` 自 W96 起不可能再从包路出现**：整份包上传/下载**两刀剔除**都把隐藏条目剔掉
       （`preset-store.js` 的 `sanitizeFullForUpload()`），新版的这一侧不会再带隐藏条目；
     · **`dropped` 仍然可能**（用户自己那份预设里有隐藏条目 → 合并结果里没有它们）—— 这正是作者说的
       "它不是都默认帮我删除了吗？"：**他认可这个默认行为本身**，要的是"别再拿这段话迷惑我"；
     · 结论 = 按作者原话**整段不显示**（§IE 的自主动手口径："能按现有口径安全落地的就落地"）。
   ⇒ 这个纯函数**保留**只为两件事：① `e2e/tmp/w94/w94-probe.js` 照旧按标记抽出来真编译（测试台依赖）；
     ② 下一任若想换个形态再提醒，判据还是这一处（不重写）。**产品代码不再调它**（W99 已核：0 调用方）。 */
/** ★W94（F3 修 C）：把"被这次对比动到的**隐藏条目**"点出来（**纯函数**，不改任何入参）。
 *
 *  为什么要有它：内核 `analyze()` 把"两份顺序表里都没有"的条目**整行剔掉**
 *  （`preset-merge.js` 的 `hiddenSkipped`，作者 v4.0 原话："它本身在预设里就是隐藏的，你就别管它"），
 *  但 `buildMerged()` 的骨架是 `clonePreset(next)` ⇒ **它们的改动照样写进新预设**，
 *  而那句提示（`analyze().notice` 里的"有 N 条…没列进来"）**只数个数**：
 *  哪几条、有没有被改 / 被丢 / 被加 —— 一个字都没有，界面上也从来不画（F3 实测：
 *  「✍网络小说文风」241→257 字被包改掉，对比列表 0 行、用户全程看不见）。
 *
 *  判据与内核**同源**（不许各写一套）：`PMx.matchPresets(an.mineIdx, an.nextIdx, {unpairKeys})`
 *  （内核 `analyze()` 里用的就是它）拿到配对；"算不算隐藏"一律问 `PMx.isHiddenEntry`
 *  （本文件/商店都调的那**唯一**一处判据，`preset-merge.js`）。
 *    · 配成一对且两边都算隐藏 → `isHiddenEntry(mine) && isHiddenEntry(next)`
 *      （= 内核 `hiddenSkipped` 的过滤式，逐字同一个）：
 *        正文/角色/注入位置/注入深度任一不同（`PMx.entryFp`，与"两边一样"同一把尺）→ **changed**
 *        （生成的新预设拿到的是 next 那一版）；
 *    · 只有我有 → 新版里没有 → 生成时会被**丢掉**（**dropped**）；
 *    · 只有新版有 → 会被**加进来**（**added**）。
 *  ★只读：不改条目、不写盘、不联网、不读时钟；任何异常都兜成空表（**绝不拖垮对比**）。
 *  @param {object} an   `PM.analyze()` 的产物
 *  @param {object} PMx  内核（真内核；探针喂同一个）
 *  @param {Array}  [unpair] 用户手动拆开的配对 key（与 `analyze` 入参同一份）
 *  @returns {{changed:Array<{name:string,before:number,after:number}>, dropped:string[], added:string[]}} */
function hiddenTouchedOf(an, PMx, unpair) {
    const out = { changed: [], dropped: [], added: [] };
    if (!an || !PMx || !an.mineIdx || !an.nextIdx) return out;
    const nmOf = (e) => String((e && (e.name || e.identifier)) || '（没名字）');
    const len = (s) => String(s == null ? '' : s).length;
    try {
        const mp = PMx.matchPresets(an.mineIdx, an.nextIdx, { unpairKeys: Array.isArray(unpair) ? unpair : [] });
        for (const p of (mp.matched || [])) {
            if (!PMx.isHiddenEntry(p.mine) || !PMx.isHiddenEntry(p.next)) continue;   // 与内核 hiddenSkipped 逐字同一个过滤式
            if (PMx.entryFp(p.mine) === PMx.entryFp(p.next)) continue;                // 两边一样（同一个指纹尺）
            out.changed.push({ name: nmOf(p.next) || nmOf(p.mine), before: len(p.mine.text), after: len(p.next.text) });
        }
        for (const me of (mp.onlyMine || [])) if (PMx.isHiddenEntry(me)) out.dropped.push(nmOf(me));
        for (const ne of (mp.onlyNext || [])) if (PMx.isHiddenEntry(ne)) out.added.push(nmOf(ne));
    } catch (e) { /* 点名失败 = 少一句话，绝不让整个对比挂掉 */ }
    return out;
}
/* ==== ywpu-hidden-note-core:end ==== */

/* ★W99-己：`noticesHtml()` 整块删除（作者原话："这一段巴拉巴拉的 —— 这是不是没必要显示出来呀？"）。
   删掉的四样：①「隐藏条目…这次会变」那段长提示与其展开标题/容器；② 内核 `analyze().notice` 那几句人话
   （W94 之前本来就一句都不渲染）；③ `S.hiddenNote` 的渲染；④ 调用点。
   `hiddenTouchedOf()` 纯函数**保留**（`e2e/tmp/w94/w94-probe.js` 照旧抽它真编译；产品已 0 调用方）。 */

/** ★W107-②c（作者原话："这些筛选内容为什么又多一遍呢？我觉得统一的就用上面的来计算以及操作就好了呀"）：
 *  顶部那排筛选 chips 的计数 = **两摊并集**（条目 + 正则）—— 「全部」那颗因此恰好 = N + M。
 *  判据两边同一套（条目侧无适配器、正则侧带 `regexFilterUI().rx` —— 与正则块当年那排逐字同源），
 *  同名的每一档把两个数字相加；点某一档时两摊一起筛（正则行的档位 = `S.filter`，见 `regexBoxHtml`）。 */
function filterCountsOfBoth() {
    const an = S.analysis || {};
    const out = filterCountsOf(an.items || [], PM, null);
    const rc = filterCountsOf(S.regexItems || [], PM, regexFilterUI().rx);
    for (const k of Object.keys(rc)) out[k] = (Number(out[k]) || 0) + (Number(rc[k]) || 0);
    return out;
}

function renderResult() {
    ensureResultSkeleton();
    // ★每次渲染都重放一遍用户选的颜色（v3.8 修）：对比窗口/详情窗口是后建的，
    //   只在 mount 时 applyColors 的话，用户上次存的自定义颜色在新开的窗口里不生效（看着像"颜色丢了"）
    applyColors();
    const an = S.analysis;
    if (!an) { for (const sel of RESULT_SLOTS) { const e = $el(sel); if (e) e.innerHTML = ''; } return; }
    const st = an.stats;
    const pending = PM.pendingCount(an.items, S.decisions);
    /* ★Wave W2 ①：这一排 chips 的**渲染搬进了 `filterChipsHtml()`**（`ywpu-filters-core` 那段）——
       正则块那一排现在调的是同一支函数（同款类名/同款"0 条不画"/同款"点自己=取消"高亮）。 */
    /* ★★W107-②c：正则块自己那排 chips 与计数句整条删了 ⇒ 这一排**两摊一起算**（并集）：
       「全部」= N + M（条目数 + 正则数）、其余每档 = 两摊同名档位相加；点某一档时两摊一起筛。
       ★★W110-A：那颗「全部」的高亮改由 `allScopeShown()` 派生（它已升格成主开关，见那个函数的注释）。 */
    const chips = filterChipsHtml(filterCountsOfBoth(), S.filter, 'data-filter', allScopeShown());
    /* ★文案审核 A0.5 #8：两块图例（"改颜色"是作者自用功能）占着所有人首屏 2 行 → 折进 `<details>`：
       平时只看见「条目状态」这一行（还能看到各状态的色块，因为它们是 `<details>` 的 summary 之外的…不，
       色块跟着折进去；summary 只写"条目状态"）。要点开才看得到色块与「恢复默认颜色」。 */
    /* ★§BY-I（2026-09-23 · 作者第十七批）：**筛选区最上面两颗"一键"按钮**（他点名的位置与左右）：
       左 = 一键选旧版（全部保留我的/旧状态）、右 = 一键选新版（新增加进来、删掉跟随删除、开关以新为准）。
       点过的那颗自己亮着（`ywpu-sel`）；**再点同一颗 = 取消全选**（回到"还没选"的默认态，亮也灭）。
       它们只管**条目**这一层（正则 / 全局参数各有自己的默认，不在这两颗的范围内 —— 报告里写明了）。 */
    /* ★§BY-I + 位置依据（见本批 e2e/tmp/au17-apply5.js 的文件头）：这两颗**并进筛选那一行**、放在最前面 ——
       不许另起一行（r9h 首屏硬指标：PC 29.5%/30%、手机 39.3%/40%，各只剩几个像素）。 */
    /* ★Wave G ②（2026-09-23 夜间 · 作者实测："筛选怎么只剩全选新的和全选旧的"）：
       这两颗**只在"真有可选项"时才画**（`chooseable` = 需要用户拍板的条目数，判据就是 `PM.needsChoice`）。
       一条都不用选的包（只改正则的包 / 两边完全一样）里，点它们只会得到一句"全部按新版定了：0 条"，
       却成了那一排唯一"活着"的东西 —— 收起来。
       **不把 0 计数的 chips 重新画出来**（诊断已判那是噪音），也不动"左旧右新"的位置口径。
       ★Wave H₂（2026-09-24 · 作者第二十批）：当初在 chips 右边补的那句短的「这个包没改条目（N 条一条都没变），
       不需要你逐条看」（`.ywpu-nochoice`）**已按作者原话删掉**（"把那个（全部/空条目右边）这一句比较短的话删掉"）
       —— 它跟下面 `renderList()` 里那句长的（`▸ 展开看全部 N 条` 上面、还额外说了"要你挑的在下面正则那块里"）
       是同一件事说两遍。删掉后 chips 那一排仍是 `全部 N ｜ 空条目 M`，不会变空。 */
    /* ★★W111-②（作者原话："点击缝入正则条目时 怎么这些一键按钮全部都不见了 我说了 能不能统一啊 统一控制啊"）：
       这颗总开关原来**只数条目** ⇒ 正则包（条目一条都不用选）`chooseable = 0` ⇒ 整排一键
       （连「保留只有我有 / 丢弃只有我有」）**一颗都不画**。判据与 W111-① 同源 = 条目 + 正则一起算：
       正则侧 = 内核 `regexNeedsChoice`（与 `regexStats.needDecide`、范围条那句"需要你选 M 条"同一个数）。 */
    const chooseable = an.items.filter(it => PM.needsChoice(it)).length
        + (S.regexItems || []).filter(it => PM.regexNeedsChoice(it)).length;
    /* ★W14 ②③：两颗新按钮（保留/丢弃只有我有）—— 只在真有「只有我有的」时才画（见 `bulkBtnsHtml`）。
       ★③ 最快捷路径写进 title：作者原话"有些用户想一键用新版、同时又保留自己加进去的条目
         ⇒ 点『一键选新版』→ 点『保留只有我有』→ 然后缝入当前预设/生成新预设"。 */
    const mineOnlyN = mineOnlyItems(an.items).length;
    const mineOnlyNrx = mineOnlyRxItems(S.regexItems || []).length;              // ★W103：正则那摊"只有我有的"也归这两颗管
    const MO = {
        n: mineOnlyN + mineOnlyNrx, active: mineOnlyModeAllNow(),
        ids: { keep: 'ywpu-bulk-mokeep', drop: 'ywpu-bulk-modrop' },
        tips: {
            keep: '把「只有我有」的 **' + (mineOnlyN + mineOnlyNrx) + ' 条**（条目 ' + mineOnlyN + ' + 正则 ' + mineOnlyNrx + '）整条勾上（保留我的：这几条照旧留在新预设里）。只动这几条，其它类别一个都不碰。再点一次同一颗 = 取消（回到「还没选」）。★最快捷的一条路：先点「一键选新版」→ 再点这颗 → 最后「生成新预设」= 全部用新版 + 你自己加的一条不丢。',
            drop: '把「只有我有」的 **' + (mineOnlyN + mineOnlyNrx) + ' 条**（条目 ' + mineOnlyN + ' + 正则 ' + mineOnlyNrx + '）选成「不要」（丢弃：新预设里不留这几条）。只动这几条，其它类别一个都不碰。再点一次同一颗 = 取消（回到「还没选」）。',
        },
    };
    /* ★Wave W2 ①：这两颗的**渲染搬进了 `bulkBtnsHtml()`**（`ywpu-filters-core` 那段）—— 正则块那一排
       现在画的是一字不差的同款按钮（作者原话"直接把它 copy 下来…全部逻辑 copy 下来"）。
       ★★W103-戊：title 里那句"范围"改了口径 —— 这几颗**现在管全部**（条目 + 正则），
         两排的按钮调的是同一支 `bulkApply` / `mineOnlyApply`。 */
    /* ★W17C-2：高亮 = **现在全部（这一键管得着的）条目是不是都在那一版**（`sideModeAllNow` 现算，
       改前读的是 `S.bulkSide` 状态位 —— 逐条点按钮 / 批量条 / 换基准重算都不会动它 ⇒ 高亮会说谎）。
       ★W103：判据扩到两摊（条目 + 正则都落在这一版才算亮）。 */
    const bulkActive = sideModeAllNow('mine') ? 'mine' : (sideModeAllNow('next') ? 'next' : null);
    const bulkBtns = chooseable ? bulkBtnsHtml(bulkActive, 'ywpu-bulk-mine', 'ywpu-bulk-next',
        '每一条都按你的（旧版）来：新版删掉的**保留**、只有我有的**留着**、开关**还原旧状态**、两边都改过的**整条用我的**。★会覆盖你已经逐条挑过的选择与你手改过的文字（不可撤销）。范围 = **全部条目 + 全部正则**（这条线现在管全部），不管你现在筛没筛。再点一次同一颗 = 全部取消选择（回到「还没选」，**不是**还原）',
        '每一条都按新版来：新版新增的**加进来**、新版删掉的**跟随删除**、开关**以新为准**、两边都改过的**整条用新版**。★会覆盖你已经逐条挑过的选择与你手改过的文字（不可撤销）。范围 = **全部条目 + 全部正则**（这条线现在管全部），不管你现在筛没筛。★点「一键选新版」时**不碰「只有我有的」**（那几条要你自己点右边那两颗）。再点一次同一颗 = 全部取消选择（回到「还没选」，**不是**还原）', MO) : '';
    /* ★★W106 ②（作者原话："这个条目状态放进最左边对比结果旁边；点击后它的折叠区域还在原地；再点击一次就收起"）：
       图例（`.ywpu-legend-fold`）**又搬了一次** —— 从"面板右上角（绝对定位）"搬进**窗口头标题那一行**
       （DOM 随之搬家：由 `buildWindow` 里的 `legendHtml()` 画；本处不再产出它）。
       ★老套件里按 `#ywpu-summary .ywpu-legend...` 取它的三处已同步改成 `#ywpu-head-top .ywpu-legend...`
         （r9h-updater-ui / r10-store-light / run-updater-extras —— 见 W106 报告"测试台改了什么"）。
       ★W103-戊/己：`#ywpu-controls` = 新的**吸顶块**（操作按钮 + 两颗范围开关 + 筛选 chips + 工具条），
       `#ywpu-brk` = 手机档的强制换行（PC 档 `display:none`，见 CSS —— 作者："电脑版直接放在后面；
       手机版后面的那些筛选另起一行"）。 */
    $el('#ywpu-summary').innerHTML = `
<div class="ywpu-box">
    ${sourceBarHtml()}
    ${troubleBarHtml()}
    ${storeBarHtml()}
</div>
<div id="ywpu-controls">
    <div class="ywpu-stats">${bulkBtns}<span class="ywpu-brk"></span>${scopeChipsHtml(S.scopeItems, S.scopeRx, (an.items || []).length, (S.regexItems || []).length)}${chips}</div>
    <div id="ywpu-toolbar"></div>
</div>`;
    /* ★§BY-I：两颗"一键"按钮（`bulkApply` 里含"再点同一颗=取消全选"那一支） */
    $el('#ywpu-summary').querySelector('#ywpu-bulk-mine')?.addEventListener('click', () => bulkApply('mine'));
    $el('#ywpu-summary').querySelector('#ywpu-bulk-next')?.addEventListener('click', () => bulkApply('next'));
    /* ★W14 ②③：两颗新按钮（只为「只有我有的」那批服务） */
    $el('#ywpu-summary').querySelector('#ywpu-bulk-mokeep')?.addEventListener('click', () => mineOnlyApply('keep'));
    $el('#ywpu-summary').querySelector('#ywpu-bulk-modrop')?.addEventListener('click', () => mineOnlyApply('drop'));
    /* ★W95 ①：提示条里的「跳过去 ▸」（作者：点提示应当**直接跳到那一条**）。
       · 委托绑在 `#ywpu-summary` 上（提示条每次对比都会重画 ⇒ 不能绑在按钮自己身上）；
       · `preventDefault + stopPropagation` 是给 summary 里那颗用的：它长在 `<details>` 的 summary 里，
         点它**不能**顺手把提示条也折起来（浏览器的默认行为对 summary 内的 button 本来就不触发 toggle，
         这里再显式挡一次，避免不同内核版本行为不一致）。 */
    $el('#ywpu-summary').onclick = (ev) => {
        const b = ev.target && ev.target.closest ? ev.target.closest('[data-tb-jump]') : null;
        if (!b) return;
        ev.preventDefault(); ev.stopPropagation();
        const v = String(b.getAttribute('data-tb-jump') || '');
        const t = anchorTrouble();
        const i = v === 'first' ? (t.jump || []).findIndex(Boolean) : Number(v);
        const msg = troubleJump(i);
        console.info('[预设更新器] 提示条跳转', { 目标: v, 结果: msg });
    };
    $el('#ywpu-summary').querySelectorAll('button[data-filter]').forEach(b => b.addEventListener('click', function () {
        const id = this.getAttribute('data-filter');
        /* ★★W110-A（作者原话："点击全部 它会默认帮我选择预设条目和正则条目 然后再点击一次全部的话
           它会帮我取消掉前面两个条目"）：**「全部」= 主开关**，不再跟别的行筛选同一路 ——
           · 现在已是"两摊都摊着 + 行筛选全看"（`allScopeShown()`，= 它自己亮着）⇒ 再点 = **两摊都收**；
           · 否则 ⇒ 两摊都摊开 + 行筛选清回「全看」（"点『全部』会把行筛选清回全看 ✓"）。
           行筛选 chips（待我处理/新版新增/只有我有/两边不同/开关不同/改了名字）语义**一个字没变**：
           单选、点自己 = 取消回「全部」那一档。 */
        if (id === 'all') {
            if (allScopeShown()) { S.scopeItems = false; S.scopeRx = false; }
            else { S.scopeItems = true; S.scopeRx = true; S.filter = 'all'; }
            renderResult(); renderFoot();
            return;
        }
        S.filter = (S.filter === id) ? 'all' : id;                   // 点自己 = 取消，回"全部"
        // ★不清 keepVisible（用户 v3.8）：处理过的条目在「点我处理」里要**继续留在列表里**，
        //   它们已经变成「已选择」绿框，正好当"刚处理过"的凭据，不会找不到、也不会误以为没处理
        renderResult();
    }));
    /* ★W103-丁：两颗范围开关（预设条目 / 正则条目）—— 点一次收起、**再点一次 = 取消筛选（放回来）**，
       可反复；与上面那排 `data-filter` 两条路互不覆盖。收起/放回要连带把两块内容重画一遍
       （`renderResult` 里会走 `renderList()` 与 `renderParams()`，正则块在后者里）。 */
    $el('#ywpu-summary').querySelectorAll('button[data-scope]').forEach(b => b.addEventListener('click', function () {
        const id = String(this.getAttribute('data-scope') || '');
        if (id === 'items') { S.scopeItems = (S.scopeItems === false); renderResult(); renderFoot(); return; }
        if (id !== 'rx') return;
        const reveal = rxScopePress();          // ★W104-乙：只改状态；要不要滚过去由它说
        renderResult();
        renderFoot();
        if (reveal) rxRevealIntoView();
    }));
    renderToolbar();
    renderList();
    renderParams();
}

function renderToolbar() {
    const host = $el('#ywpu-toolbar');
    if (!host) return;
    const acc = getSettings().accordion;
    host.innerHTML = `
<div class="ywpu-tools">
    <input class="ywpu-input" id="ywpu-search" placeholder="搜索条目名…" value="${esc(S.search)}">
    <span class="ywpu-flex">
        <button class="ywpu-btn ywpu-mini" id="ywpu-expand-all">全部展开</button>
        <button class="ywpu-btn ywpu-mini" id="ywpu-collapse-all">全部收起</button>
        <span class="ywpu-sep"></span>
        <button class="ywpu-btn ywpu-mini${acc ? '' : ' ywpu-sel'}" id="ywpu-mode-multi" title="可以同时展开多条，方便来回对照">多条</button>
        <button class="ywpu-btn ywpu-mini${acc ? ' ywpu-sel' : ''}" id="ywpu-mode-one" title="展开一条自动收起其它，适合一条条过">单条</button>
    </span>
</div>`;
    /* ★★W107-②a（作者原话："那个搜索和全部展开全部收起 多条单条 应该也是固定在上面的呀
       为什么只有点击预设条目里面才有呢"）：下面每一键都**两摊一起**（"作用于当前显示的那一摊"）——
           搜索按名筛两摊、展开/收起两摊的行一起动；「单条」的手风琴已在正则行开合那支里接上（见 renderRegexBox）。 */
    $el('#ywpu-search').addEventListener('input', function () { S.search = this.value; renderList(); renderRegexBox(); });
    $el('#ywpu-expand-all').addEventListener('click', () => {
        /* ★W110-C：「全部展开」只展开**真能展开的**那些（空展开的那些命中不了，点了也没得展）。 */
        for (const it of visibleItems()) if (expandableItem(it)) S.expanded[it.key] = true;
        const m = { ...(S.regexRowOpen || {}) };
        for (const k of regexRowKeysShown()) m[k] = true;     // 展开的是**画出来的那些行**（与所见逐条一致）
        S.regexRowOpen = m;
        renderList(); renderRegexBox();
    });
    $el('#ywpu-collapse-all').addEventListener('click', () => { S.expanded = {}; S.regexRowOpen = {}; renderList(); renderRegexBox(); });
    $el('#ywpu-mode-multi').addEventListener('click', () => { getSettings().accordion = false; saveSettings(); renderToolbar(); });
    $el('#ywpu-mode-one').addEventListener('click', () => { getSettings().accordion = true; saveSettings(); renderToolbar(); });
}

/** ★W107-②a：现在画在屏幕上的正则行的 key（= `#ywpu-rx-host` 里那些 `.ywpu-rxrow[data-rx]`）——
 *  "全部展开"用它跟所见逐条对齐（块没显示 / 没有正则 ⇒ 空数组，一个键都不碰）。
 *  ★读 DOM 而不是复刻一遍行选择逻辑：所见即所动，永远不会跟屏幕错位。 */
function regexRowKeysShown() {
    const host = $el('#ywpu-rx-host');
    if (!host) return [];
    return [...host.querySelectorAll('.ywpu-rxrow[data-rx]')].map(r => r.getAttribute('data-rx')).filter(Boolean);
}

function renderParams() {
    const host = $el('#ywpu-params');
    if (!host) return;
    const ps = S.analysis?.params || [];
    /* ★Wave K1（2026-09-24 · 作者第 19 批第 4 条）：**「新版还改了 N 个全局参数」对用户隐藏**
       （作者原话："底部那句「新版还改了多少个全局参数」对用户隐藏（正则必须保留可见）"）。
       口径：整块参数框**不画**（连那句 summary 一起）—— 合并时全局参数**照旧默认跟新版**，
       一个字节都没变（`S.params` 空 ⇒ `buildMerged({params: []})` ⇒ 全按新版；内核那套本来就是这样）。
       正则块**照旧挂在同一个容器里**（`renderRegexBox(host)` 在下面，不受这里影响）。
       ★为什么留一个 `showParams` 开关而不是直接删代码：作者/维护者想临时看参数差异时
         （`SillyTavern.getContext().extensionSettings.preset_updater.showParams = true` 再重开面板即可）
         不用改代码；默认 **undefined = 隐藏**（用户拿到的就是"看不见"）。
       回滚法：把 `|| !showParams` 去掉即恢复改前行为（一行）。 */
    const showParams = getSettings().showParams === true;
    if (!ps.length || !showParams) { host.innerHTML = ''; }
    else {
        // 用户反馈：这块一般不用动 —— 收成一行折叠说明，默认就是"跟新版"
        host.innerHTML = `
<div class="ywpu-paramsbox">
    <details>
    <summary>新版还改了 <b>${ps.length}</b> 个全局参数（默认跟新版）</summary>
    ${ps.map(p => `
        <div class="ywpu-pitem" data-param="${esc(p.key)}">
            <span class="ywpu-item-name">${esc(p.key)}</span>
            <span class="ywpu-note">我的：<b>${esc(shortVal(p.mine))}</b> ｜ 新版：<b>${esc(shortVal(p.next))}</b></span>
            <span class="ywpu-flex">
                <!-- ★§BY-F：本来就左旧右新（用我的 | 用新版），本次一个字节没动 -->
                <button class="ywpu-btn ywpu-mini ${S.params[p.key] === 'mine' ? 'ywpu-sel' : ''}" data-pact="mine">用我的</button>
                <button class="ywpu-btn ywpu-mini ${S.params[p.key] !== 'mine' ? 'ywpu-sel' : ''}" data-pact="next">用新版</button>
            </span>
        </div>`).join('')}
    </details>
</div>`;
        host.querySelectorAll('button[data-pact]').forEach(b => b.addEventListener('click', function () {
            const node = this.closest('.ywpu-pitem');
            S.params[node.getAttribute('data-param')] = this.getAttribute('data-pact');
            renderParams();
        }));
    }
    // ★R8：正则块挂在同一个容器里（**在条目列表下面**，所以条目那套的几何/顺序断言不受影响）
    /* ★★W107-②（作者原话："筛选了正则条目的时候……和那个预设条目一模一样，不要多出任何东西"）：
       范围开关「正则条目」收起来时**什么都不画**了 —— 原来那条 `▸ 正则条目 N 条` 折叠条（W103-丁 加的）
       列入本轮"不许再多出来"的清单；放回来的入口 = 顶部那颗「正则条目」（点一次必达可见）。
       收起/放回的判定搬进 renderRegexBox()（那里同时管 #ywpu-rx-host 的建立与移除）。 */
    renderRegexBox(host);
}

function shortVal(v) {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s === undefined ? '—' : (s.length > 60 ? s.slice(0, 60) + '…' : s);
}

/* ==== ywpu-regex-core:start ==== */   // ★这一段会被 e2e/tmp/probe-regex-core.js 按标记抽出来真编译（口径 = 真实产品代码）
// ---------------------------------------------------------------- 预设级正则（R8 · 结构化预留）
//  内核那头已经全做完（preset-merge.js 的 analyzeRegexes / mergeRegexes / applyRegexOps / regexSafetyCheck）。
//  这一段的活儿只有两件：① 把每一行**画出来**（红蓝 diff / 三选一 / 位置待定徽标 / 安全标红）
//  ② 把用户的勾选写回 S.regexDecisions（生成时交给 buildMerged 的 regex 参数）。
//  ★不做：拖动排序与手选位置（留给带浏览器的那一批，见 r8-kernel-status.md 的"待浏览器验证清单"）。

/** 正则行的状态徽标 —— ★W100-丙：与条目侧同一套口径（用词统一 + **一个条目可以同时挂多枚**）：
 *  改了名字（青）/ 改了内容（紫）/ 改了开关（蓝灰）—— ★W108-①-2 起与条目侧、图例/筛选同序；三个维度各挂各的（作者原话："三个标签同时显示"）；
 *  "到底谁改的"放悬浮说明，不占徽标。 */
function regexBadgesOf(item) {
    const st = String((item && item.status) || '');
    if (item && item.kind === 'mineOnly') return [{ cls: 'ywpu-st-onlyMine', text: '只有我有' }];
    if (item && item.kind === 'nextOnly') return [{ cls: 'ywpu-st-onlyNext', text: '新版新增' }];
    if (st === 'same' && !(item && item.disabledDiff)) return [{ cls: 'ywpu-st-same', text: '两边一样' }];
    const out = [];
    /* ★W108-①-2：推入序 = 名字 → 内容 → 开关（与条目侧 statusLabels() 同一次序） */
    if (item && item.nameChanged) out.push({ cls: 'ywpu-st-renamed', text: '改了名字' });
    if (item && item.bodyChanged) out.push({ cls: 'ywpu-st-both', text: '改了内容' });
    if (item && item.disabledDiff) out.push({ cls: 'ywpu-st-switch', text: '改了开关' });
    if (!out.length) out.push({ cls: 'ywpu-st-both', text: '改了内容' });
    return out;
}
/** 兼容壳（老的取单枚调用点）：第一枚 = 主标签 */
function regexBadgeOf(item) { return regexBadgesOf(item)[0]; }

/** 一条正则的"开关/作用范围"逐条可见（安全评审 ③ 第 4 条：disabled / promptOnly / markdownOnly 必须看得见）
 *  ★W95 ⑤（作者："我看到 `编辑时也跑` 这一个句子 —— 这是什么意思？我不太清楚"）：
 *   它 = ST 正则脚本的 `runOnEdit` 字段（**你在聊天里编辑某条消息时，这条正则也再跑一遍**；
 *   不勾就只在生成/重生成时跑）。原来的四个字是**照抄字段名的直译**，作者看不懂 ⇒ 改成一句人话。
 *   为什么**不删**：它不是装饰 —— 它决定"你改消息时这段替换会不会再作用一次"，
 *   两条正则只差这一位就会产生完全不同的结果（`regexFieldDiff` 也会把它当一维差异列出来）。 */
function regexFlagText(script, PMx) {
    const s = script || {};
    const parts = [];
    parts.push(s.disabled ? '关' : '开');
    const place = Array.isArray(s.placement) ? s.placement : [];
    const labelOf = (n) => ((PMx.REGEX_PLACEMENT_LABEL || {})[n] || ('位置' + n));
    parts.push('作用：' + (place.length ? place.map(labelOf).join('+') : '（没选作用位置）'));
    const only = [];
    if (s.markdownOnly) only.push('只作用于显示');
    if (s.promptOnly) only.push('只作用于提示词');
    if (only.length) parts.push(only.join('·'));
    if (s.runOnEdit) parts.push('你改消息时也跑一遍');
    return parts.join(' ｜ ');
}

/** ★W95 ④：一格字段值（`cls` 区分旧/新版那一侧 —— `ywpu-rxold` / `ywpu-rxnew` 两个类名**照旧产出**，
 *  `probe-regex-core.js` 有两断言按它们取"你的（红）/ 新版（绿）"，语义一个字没变）。
 *  ★"弧形"就此消失：改前它们是 `border-left: 2px + border-radius` 的**小药丸**（左边一条弧形描边），
 *    现在是**组里的普通一行**（上下两组各占一块底色，跟条目侧 `.ywpu-grp` 一套骨架）。 */
const rxValHtml = (cls, s, escFn) => '<span class="ywpu-rxval ' + cls + '">'
    + escFn(String(s == null || s === '' ? '（空）' : s)) + '</span>';
const rxLineHtml = (label, inner, escFn) => '<div class="ywpu-rxline"><span class="ywpu-rxkey">'
    + escFn(label) + '</span>' + inner + '</div>';

/** 一行"我的 / 新版"的正文对照 —— ★W95 ④：改成**上下两组**（作者原话："是否可以像上面的那些提示词条目一样：
 *  不点进去时不显示里边的更改内容；里边的更改内容**上下对比**，**标注好旧版、也标注好新版**"）。
 *  · 上面一组 = `旧版`（红底，复用条目侧 `.ywpu-grp-mine`），下面一组 = `新版`（绿底，`.ywpu-grp-next`）；
 *  · 两组列的是**同一批字段**（逐行对着看，一眼比出哪一栏变了）—— 改前是"每栏一行、红绿并排"；
 *  · 长内容（findRegex / replaceString）走 `ywpu-rxwrap`（`white-space: pre-wrap` + `break-all`）⇒ 换行显示、看得全；
 *  · 只有一方有这条正则时：另一方那组显示一句占位（跟条目侧 `（旧版这里什么也没有）` 同一个写法）。 */
function regexDiffHtml(item, PMx, escFn, d) {
    const mine = item && item.mine ? item.mine.script : null;
    const next = item && item.next ? item.next.script : null;
    const dc = (d || {});
    /* ★★W101-乙⑦（作者原话："正则部分**里面的选择逻辑 根本没有实现** —— 要可以**直接点选**啊，
       而且**点选逻辑要和条目一样**啊，**要学习全套**"）：这两组从"只读的对照"升成**可点选**的
       那一对（`data-rxuse`，写的是行里那排按钮同一个键 `d.use`）——选中盖章 ✓、另一组变暗、
       再点同一组 = 取消，与条目侧 `.ywpu-grp[data-act="pick-side"]` **逐字同一套**。
       `use === 'both'`（两条都留）：两组都在结果里 ⇒ 两组都盖章、都不变暗。 */
    const useOn = (which) => (dc.use === which || dc.use === 'both');
    const grp = (which, rows) => {
        const lab = which === 'mine' ? '旧版' : '新版';
        const cls = which === 'mine' ? 'ywpu-rxold' : 'ywpu-rxnew';
        const on = useOn(which);
        const body = rows.length
            ? rows.map(r => rxLineHtml(r[0], rxValHtml(cls + (String(r[1]).length > 120 ? ' ywpu-rxwrap' : ''), r[1], escFn), escFn)).join('')
            : '<div class="ywpu-rxline"><span class="ywpu-pl-none">（' + (which === 'mine' ? '旧版这里什么也没有' : '新版把这一条删了') + '）</span></div>';
        return '<div class="ywpu-grp ywpu-rxgrp ywpu-grp-' + which + (on ? ' ywpu-on' : '') + '" data-rxside="' + which + '" data-rxuse="' + which + '" title="点这里 = 结果里用' + lab + '（再点一次 = 取消）">'
            + '<span class="ywpu-grp-lab">' + lab + '</span><div class="ywpu-grp-rows">' + body + '</div>'
            + (on ? '<span class="ywpu-stamp" title="结果里用这一版">✓</span>' : '') + '</div>';
    };
    if (!mine || !next) {
        const one = next || mine;
        const rows = [['查找（findRegex）', String((one || {}).findRegex || '')], ['替换（replaceString）', String((one || {}).replaceString || '')]];
        return next ? (grp('mine', []) + grp('next', rows)) : (grp('mine', rows) + grp('next', []));
    }
    const diffs = PMx.regexFieldDiff(mine, next);
    /* ★★W101-乙⑥（作者原话："我检查了改了名字的：里面怎么有**两处对比**啊？……**不止改了名字 ——
       我发现所有的都有两遍**"）**根因**：`regexFieldDiff()`（`preset-merge.js:2168/2173`）把
       `scriptName`（名字）与 `disabled`（开关）**也**当成"更改内容"的一行推了进来，而这两维
       在展开区**上面已经有了自己的选择块**（`rxDimChoiceHtml()` 的 name / en 块，可点选）
       ⇒ 同一个差异画两遍：一遍能选、一遍不能选（作者看到的就是它）。
       修法 = 这里把这两维**从"更改内容"里剔掉**（判据用内核给的 `field` 名，不是自己数行数）：
       · 名字 → 只由「名字」那块承担；开关 → 只由「开关」那块承担（**恰好 1 处**，可点选的那一处）；
       · 剔完还有别的字段（查找/替换/trimStrings/…）→ 照旧上下两组画出来；
       · 剔完一个字段都不剩（那就是"只改名/只换开关"）⇒ 这一块**整块不画**（`''`）——
         不能再写「（两边一模一样）」，那句话在"名字/开关不同"的语境里是假的。 */
    const rest = diffs.filter(x => x.field !== 'scriptName' && x.field !== 'disabled');
    if (!diffs.length) return '<div class="ywpu-rxline"><span class="ywpu-rxval">（两边一模一样）</span></div>';
    if (!rest.length) return '';
    return grp('mine', rest.map(x => [x.label, x.mine]))
        + grp('next', rest.map(x => [x.label, x.next]));
}

/** ★★W99-甲（2026-10-06 · 作者原话："**正则也是改了名字、改了开关、改了具体内容，在里边都要显示体现出来**"，
 *  以及"格式就跟那个具体内容对比一样，让用户选择一样，要选完所有的"）：
 *  正则行**展开区**里那两组选择块 —— 开关 / 名字（内容那一套是 `regexDiffHtml()`，照旧）。
 *  · 骨架与条目侧 `dimChoiceHtml()` **逐字同源**（`.ywpu-patch` + `.ywpu-grp-mine/next` 上下两组 + 盖章 `✓`）；
 *  · 点哪一组 = 用哪一组，**再点同一组 = 取消**（`data-rxdim` / `data-side`，事件在 `renderRegexBox()` 里绑）；
 *  · 写的是与行里按钮**同一份决策表**（`d.enabled` / `d.name`）—— 内核 `regexItemDecided()` 认的就是它。
 *  @param {object} it 内核正则条目产物（`mine/next` 都在才有两个值可选）
 *  @param {object} d  这一行的决策（`S.regexDecisions[key]`）
 *  @param {Function} escFn 转义
 *  @returns {string} HTML（没有这两维 → 空串） */
function rxDimChoiceHtml(it, d, escFn) {
    if (!it || !it.mine || !it.next) return '';
    const dc = (d || {});
    const grp = (dim, which, value) => {
        const on = (dim === 'name') ? (dc.name === which) : (dc.enabled === which);
        const lab = which === 'mine' ? '旧版' : '新版';
        return '<div class="ywpu-grp ywpu-rxgrp ywpu-grp-' + which + (on ? ' ywpu-on' : '') + '" data-rxdim="' + dim + '" data-side="' + which + '" title="点这里 = 结果里用' + lab + '（再点一次 = 取消）">'
            + '<span class="ywpu-grp-lab">' + lab + '</span><div class="ywpu-grp-rows"><div class="ywpu-pl ywpu-pl-grp">' + escFn(String(value)) + '</div></div>'
            + (on ? '<span class="ywpu-stamp" title="结果里用这一版">✓</span>' : '') + '</div>';
    };
    const out = [];
    /* ★W101-甲②（同一处改动在条目侧 `dimChoiceHtml()`；作者原话："`旧版 关（你原来是关的）/
       新版 开（新预设里是开的）` ⇒ 改成 `旧版 OFF` / `新版 ON`"）：值只写 ON / OFF。
       ★W101-甲④：名字在前、开关在后（与条目侧逐字同一个次序）。 */
    if (it.nameChanged) {
        out.push('<div class="ywpu-patch ywpu-k-dim" data-dim="name" data-decided="' + ((dc.name === 'mine' || dc.name === 'next') ? 1 : 0) + '"><span class="ywpu-patch-tag">名字</span><div class="ywpu-patch-body">'
            + grp('name', 'mine', (it.mine.script && it.mine.script.scriptName) || it.mine.name || '（没名字）')
            + grp('name', 'next', (it.next.script && it.next.script.scriptName) || it.next.name || '（没名字）') + '</div></div>');
    }
    if (it.disabledDiff) {
        const mv = it.mine.script.disabled !== true ? 'ON' : 'OFF';
        const nv = it.next.script.disabled !== true ? 'ON' : 'OFF';
        out.push('<div class="ywpu-patch ywpu-k-dim" data-dim="en" data-decided="' + ((dc.enabled === 'mine' || dc.enabled === 'next' || typeof dc.enabled === 'boolean') ? 1 : 0) + '"><span class="ywpu-patch-tag">开关</span><div class="ywpu-patch-body">'
            + grp('en', 'mine', mv) + grp('en', 'next', nv) + '</div></div>');
    }
    return out.length ? '<div class="ywpu-dims">' + out.join('') + '</div>' : '';
}

/** 一整块（页头一行 + 那一排筛选/一键 + 逐条）—— 默认**收起**（只有"条目一条都不用选 + 这个包改了正则"的包默认展开，见 runAnalyze）；
 *  ★Wave G ⑥：块里面也**先给"要你看的"** —— 两边一样的折进一句「另有 N 条两边一样（点开看）」，
 *    点开照旧一条不少（**不是删掉内容**，只是默认折着）。
 *  ★★Wave W2 ①（2026-09-24 · 作者第 20 批）：**筛选那一排与两颗"一键"照抄条目区** ——
 *    步骤：本函数只看 `state.regexFilter`（= 选中哪一档）挑要画哪些行；
 *    那一排 chips 与两颗一键的 **HTML 由调用方通过 `F` 喂进来**（`REGEX_FILTER_UI`，见 `renderRegexBox`），
 *    它们就是条目区用的那两支函数（`filterChipsHtml()` / `bulkBtnsHtml()`）—— 作者要的"全部逻辑 copy 下来"。
 *    ★为什么走参数而不是直接调：**本函数会被 `e2e/probe-regex-core.js` 抽出来单独编译**（那一段只吃参数、
 *      不读外面）⇒ 没喂 `F` 时**只是不画那一排**，逐条渲染、位次、按钮一个字节不变（老断言零影响）。
 *  @param {object} state 产品状态（`S`）或探针自造的等价对象
 *  @param {object} PMx   内核
 *  @param {Function} escFn 转义
 *  @param {object} [F]   筛选排/一键的渲染件：`{ chips(counts, active), bulk(active), counts(items), active }` */
function regexBoxHtml(state, PMx, escFn, F) {
    const items = (state && Array.isArray(state.regexItems)) ? state.regexItems : null;
    if (!items || !items.length) return '';
    const st = (state && state.regexStats) || {};
    /* ★★W107-②：`state.regexOpen`（内层折叠）**不再读** —— 外框整条删掉后，"本函数被调用"就等于"直接画行"
       （显示与否由调用方按 `S.scopeRx` 决定，见 renderRegexBox）。老探针仍可传这个键，只是不再有作用。 */
    /* ★W17C：这里原来还有 `const touched = (state && state.regexTouched) || {}` —— 只给那颗「要你看 N 条」
       服务，那颗已按作者原话删掉 ⇒ 现在整块不再读 `regexTouched`（要读它的地方只剩 `regexFilterUI().rx.pending`）。 */
    const placeOv = (state && state.regexPlace) || {};
    const opts = (state && Array.isArray(state.regexPlaceOpts)) ? state.regexPlaceOpts : [];
    const needs = (it) => (PMx.regexNeedsChoice ? !!PMx.regexNeedsChoice(it) : true);
    /* ★Wave W2 ①：当前选中的是哪一档（**默认 `'pending'` = 作者要的「待我处理」**；没设过也按它）。
       `all` = 全部（把"两边一样"那批也平铺出来）。其余档 = 按 `F` 那一套判定挑行。
       ★★W107-②（作者原话："统一的就用上面的来计算以及操作"）：档位来源从正则块自己那排（`state.regexFilter`）
       **改成顶部那排统一的那个**（`state.filter`）—— 产品的这两份状态从此同源；老探针自造 state 时
       若仍只带 `regexFilter`，这里照旧认它（兜底，不算放宽：产品态里两者本就同源同值）。 */
    const active = String((state && (state.filter || state.regexFilter)) || 'pending');
    /* ★W107-②a：顶部工具条的「搜索条目名」也作用于这一摊（"都能作用于当前显示的那一摊"）—— 按行名过滤。 */
    const kw = String((state && state.search) || '').trim().toLowerCase();
    const listItems = kw ? items.filter(it => String((it && it.label) || '').toLowerCase().includes(kw)) : items;
    const allMode = active === 'all';
    /* ★Wave H₂ ①（2026-09-24 · 作者第二十批："它那个正则它其实跟那个条目一样 它是有顺序的要求的 你现在它缝入
       它并没有看出来顺序是在哪里"）：**正则也要有"顺序"** —— 加一颗筛选 chip「仅看需要更改的」（**默认就是它**，
       再点一次 = 取消 ⇒ 把"两边一样"那批也平铺出来），并给每一行一枚「第 N 位」徽标。
       ★**不做**"逐处挑 / 每处上下两组"（作者明确否掉：正则只需要做顺序，每一条单独生效 —— 那是 Wave H 的范围，已整体撤回）。
       位次数据 = `state.regexPos`（由 `regexPosMapNow()` 在 `renderRegexBox` 里算好塞进 state；**纯 Node 探针
       自造 state 时没有这个键 ⇒ 一个徽标都不画**，老断言零影响）。 */
    /** 这一行在**最终合并清单**里排第几？取位次的三级阶梯（跟内核配对同精神，**找不到就不写** —— 宁可不说，不许说错）：
     *  ① 正则 `id` 相同；② 归一化名字**唯一**；③ 都没有 ⇒ 不显示。
     *  两条都在最终清单里（`两条都留`）⇒ 位次说不清 ⇒ 也不写。 */
    const posOf = (it) => {
        const P = (state && state.regexPos) || null;
        if (!P || !P.byId) return null;
        const scripts = [it.next, it.mine].filter(Boolean).map(x => x.script || x);
        const hit = [];
        for (const s of scripts) { const p = (s && s.id) ? P.byId.get(String(s.id)) : null; if (p) hit.push(p); }
        const uniq = [...new Set(hit)];
        if (uniq.length === 1) return uniq[0];
        if (hit.length > 1) return null;
        const nkf = P.normName;
        for (const s of scripts) {
            const nk = nkf ? nkf(s.scriptName) : String(s.scriptName || '');
            const arr = nk ? P.byName.get(nk) : null;
            if (arr && arr.length === 1) return arr[0];
        }
        return null;
    };
    /* ★W17C（作者 2026-09-24 原话）："关于正则…那个折叠那个栏 左边有一个要你看几条…因为右边已经有一个
       待我处理了呀 把这个要你看几条删去吧" ⇒ 标题行最前面那颗「要你看 N 条 / ✓ 正则这边都看过了」
       （Wave K1 加的）**整颗删掉**。
       ★为什么安全（已核）：它右边**同一排**就有筛选 chips（`F.chips()` = 条目区那支 `filterChipsHtml()`），
       里面有「**待我处理**」且**默认就是它亮着**（`regexFilter` 默认 `'pending'`，判据 = `regexNeedsChoice`
       且你没亲手点过）⇒ 待处理计数一个数都没丢，只是不再重复显示两遍。
       ⇒ 跟着一起没用的是这两个局部量：`touched` 与 `need`（只在那一颗里用过；`git grep` 已核）。
       回滚法：把下面那两行加回来，并在 `rxbar` 的 `${rxChips}` 前面写回 `${todoChip}`。 */
    /* ★★W107-②（作者原话："然后还有什么正则30多条 内容不同多少条 只有我有多少条 新版新增多少条……
       这些筛选内容为什么又多一遍呢？"）：上面那枚折叠颗连同这句计数（`正则 N 条 · 内容不同 …`）**整条删掉** ——
       外框（`.ywpu-rxbar`）随本轮"不要多出任何东西"一起删除；计数的活儿由顶部那排 chips 的两摊并集承担
       （见 `filterCountsOfBoth()`）。（W17C 当年删掉的「要你看 N 条」那颗也在这条线上，一并不存在了。）
       ▲判据锚点：产品源码里 `const head = '正则 '` 恰好 0 命中（W107 探针按它取数）。 */
    /** ★Wave G ③b：这一行是"新版里没有它"（只有我有）→ 按钮口径跟**条目侧**一字不差（保留 / 不要）。
     *  改前这里画的是三颗（用我的 / 两条都留 / 用新版），而内核那条路上 `d.use !== 'mine'` **一律算删掉**
     *  ⇒ 点一颗写着「两条都留」的按钮，这条正则被删了（真数据损失，作者 P3-3 点名的"删除要你确认"也落不了地）。 */
    const picksOf = (it, d) => {
        /* ★W99-戊：`data-rx` 那几颗（内容键）在 `renderRegexBox` 里是**可取消**的（点亮的再点 = 取消，
           与条目侧那三颗逐字同一个口径）；`data-rxname` / `data-rxdim` 是新加的"名字/开关"两维。 */
        const btn = (a, label, on, en) => `<button class="ywpu-btn ywpu-mini${on ? ' ywpu-sel' : ''}" ${en ? `data-rxen="${a}"` : `data-rxact="${a}"`}>${label}</button>`;
        const switchOnly = it.status === 'same' && !!it.disabledDiff && !!it.mine && !!it.next;
        if (switchOnly) {
            /* 正文一字未动、只有开关不同 → 这一行唯一有意义的一维就是开关 ⇒ 跟条目侧那两颗同一个口径
               （左=还原旧状态 / 右=保持新状态），写的是 `enabled`（内核 `mergeRegexes` 按它决定 disabled）。 */
            return btn('mine', '还原旧状态', d.enabled === 'mine', true) + btn('next', '保持新状态', d.enabled === 'next', true);
        }
        if (it.kind === 'mineOnly') return btn('mine', '保留', d.use === 'mine') + btn('next', '不要', d.use === 'next');
        /* ★W17C-2③（作者本批原话）：单边行**不画「两条都留」** —— "没有'我那份'可另存"：
           · `nextOnly`（新版新增）行改前画「不要 | 两条都留 | 加进来」，而内核 `mergeRegexes` 对 `!it.mine`
             那一支是 `out.push({...n})`（**直接加进来，不另存副本**）⇒ 那颗按钮**点了跟「加进来」一模一样**
             （实测：`e2e/bulk-decided-repro.js` 的 ⑨ 那一栏 + 探针 `w17c-ui.js` 都核过）⇒ 藏掉，免得用户以为
             "两版都留下了"。
           · `mineOnly`（只有我有）行本来就只有「保留 | 不要」（Wave G ③b 定的，没有「两条都留」）⇒ 这一行
             **没有可藏的东西**；那两颗是用户留住/删掉这条正则的**唯一入口**，一个字都不能动。
           ★只动**界面渲染**：`bulkRegexDecisions` / `mergeRegexes` 的取值与 W14"一键不碰只有我有的"全部不变。 */
        if (it.kind === 'nextOnly') return btn('mine', '不要', d.use === 'mine') + btn('next', '加进来', d.use === 'next');
        /* ★W95 ④（作者原话："对于同时改了名字又改了内容，下面那个选择框也要做一个相对应的适配 ——
           你要想到：单改一项、或单改多项，对用户来说怎么选最合理"）。
           ★★W99-甲（2026-10-06）：**名字从"内容选项的注脚"升成独立的一维** ——
             作者原话："两边不同到底是选择旧版开关、新版开关，以及选择旧版名字还是新版名字……
             **要选完所有的**"。⇒ 现在的落点：
               · **只改了名字**（正文一字未动 → `it.renamed`）：行里就两颗「用旧名字 / 用新名字」，
                 写的是 **`d.name`**（改前写 `d.use` —— 现在名字有自己的键，与展开区那两组块同一个）；
               · **名字和内容都改了**：三颗改回**只管内容**（写 `d.use`，不再顺手写 `enabled`）＋
                 行里再加两颗名字键；展开区有"名字"那两组块（`rxDimChoiceHtml`）—— 两处同一个键；
               · **只改了内容**：名字两边一样 ⇒ 维持原样三颗。
           ★"必须选完"由内核 `regexItemDecided()` 一道判：内容 `use` + 名字 `name` + 开关 `enabled` 都要有。
           ▲判据锚点（探针按它取数）：`data-rxname="mine|next"` = 名字那一维的两颗。 */
        if (it.renamed) return `<button class="ywpu-btn ywpu-mini${d.name === 'mine' ? ' ywpu-sel' : ''}" data-rxname="mine">用旧名字</button>`
            + `<button class="ywpu-btn ywpu-mini${d.name === 'next' ? ' ywpu-sel' : ''}" data-rxname="next">用新名字</button>`;
        const nameBtns = it.nameChanged
            ? `<button class="ywpu-btn ywpu-mini${d.name === 'mine' ? ' ywpu-sel' : ''}" data-rxname="mine">用旧名字</button>`
                + `<button class="ywpu-btn ywpu-mini${d.name === 'next' ? ' ywpu-sel' : ''}" data-rxname="next">用新名字</button>`
            : '';
        if (it.nameChanged && it.bodyChanged) {
            return btn('mine', '用我的（旧名字）', d.use === 'mine') + btn('both', '两条都留', d.use === 'both')
                + btn('next', '用新版（新名字）', d.use === 'next') + nameBtns;
        }
        return btn('mine', '用我的', d.use === 'mine') + btn('both', '两条都留', d.use === 'both') + btn('next', '用新版', d.use === 'next');
    };
    /** ★★W101-乙⑦：这一行"还剩几处没选"（**与条目侧 `decideProgress()` 同一套口径**：
     *  逐维计数、亲手选过才算；判据与内核 `regexItemDecided()` 逐条同源 —— 三处维度：
     *  内容 `use` / 名字 `name` / 开关 `enabled`；"只改名"与"只开关"两种只有一维）。
     *  纯局部（只用参数 + 传进来的 `PMx`）—— 这一段会被 `probe-regex-core.js` 抽出来单独编译。 */
    const progressOf = (it, d) => {
        const dc = (d || {});
        const ST_ = (PMx && PMx.STATUS) || {};
        const paired = !!(it && it.mine && it.next);
        const switchOnly = paired && it.status === ST_.SAME && !!it.disabledDiff;
        const needs = (PMx && PMx.regexNeedsChoice) ? !!PMx.regexNeedsChoice(it) : true;
        if (!it || !needs) return { total: 0, decided: 0, left: 0 };
        if (switchOnly) { const ok = (dc.enabled !== undefined && dc.enabled !== null) ? 1 : 0; return { total: 1, decided: ok, left: 1 - ok }; }
        if (it.renamed) { const ok = (dc.name === 'mine' || dc.name === 'next') ? 1 : 0; return { total: 1, decided: ok, left: 1 - ok }; }
        let total = 1, decided = dc.use ? 1 : 0;
        if (it.nameChanged) { total += 1; if (dc.name === 'mine' || dc.name === 'next') decided += 1; }
        if (paired && it.disabledDiff) { total += 1; if (dc.enabled === 'mine' || dc.enabled === 'next' || typeof dc.enabled === 'boolean') decided += 1; }
        return { total, decided, left: Math.max(0, total - decided) };
    };
    const rowHtml = (it) => {
        const bs = regexBadgesOf(it);
        const one = it.next ? it.next.script : (it.mine ? it.mine.script : {});
        const d = (state.regexDecisions || {})[it.key] || {};
        const pg = progressOf(it, d);
        /* ★W101-乙⑥：更改内容那一块现在**只在真有"内容"差异时**才画（名字/开关那两行已经
           从 `regexDiffHtml()` 里剔掉了 —— 它们各自有自己的选择块）。
           `data-decided` = `use` 这一维有没有选过（没选过 ⇒ 两组一样亮，与条目侧 `.ywpu-patch[data-decided="0"]` 同一个口径）。 */
        const rxDiffBody = regexDiffHtml(it, PMx, escFn, d);
        const rxDiff = rxDiffBody
            ? '<div class="ywpu-rxdiff" data-decided="' + ((d.use === 'mine' || d.use === 'next' || d.use === 'both') ? 1 : 0) + '">' + rxDiffBody + '</div>'
            : '';
        const safety = (it.safety && it.safety.risk !== 'ok') ? it.safety : ((it.mineSafety && it.mineSafety.risk !== 'ok') ? it.mineSafety : null);
        const switchOnly = it.status === 'same' && !!it.disabledDiff && !!it.mine && !!it.next;
        /* ★Wave H₂ ①：这一行在**最终预设**里排第几（`第 N 位`）。数据 = 内核最终的 `mergeRegexes().list`
           （跟 Wave G ⑤"手选插在哪条后面"的候选**同一份数据**），不是页面顺序。
           算不出来（没 id 且名字不唯一 / 两条都留）⇒ **不画**（宁可不说，不许说错）。 */
        const pos = posOf(it);
        const posTag = pos ? `<span class="ywpu-of ywpu-of-pos" title="按你现在的选择算出来的最终位置（内含「两条都留」「位置待定」等一切结果）· 共 ${(state.regexPos && state.regexPos.total) || 0} 条">第 ${pos} 位</span>` : '';
        /* ★★W101-乙⑥（作者原话："我检查了改了名字的：里面怎么有两处对比啊？**还有一处外面的、没法选择的对比**？？？
           **那一处删除啊**"）：这里原来画的 `On → Off` 牌子（`.ywpu-swdiff`，Wave G ③ 加的）**整颗删掉** ——
           它挂在 `.ywpu-rxmeta` 里（**展开区外面**、收起态也看得见），而且它**没法点**。
           开关那件事现在只说一处 = 展开区「开关变化」那块（`rxDimChoiceHtml()`，旧版 OFF / 新版 ON，
           可直接点选）。★与条目侧 W101-甲① **逐字同一个口径**（两边的 `On → Off` 一起删）。
           ▲`data-rxdiff="1"`（行属性）与那排 `data-rxen` 按钮**一个字节没动** —— 探针/回归按它们取数。 */
        /* ★Wave G ⑥-gap3：三方对比时"这条到底是谁改的"给一枚可见胶囊（跟条目侧 `whoPillHtml` 同一个类、同一句话；
           两方对比判不出来 → 一个字节都不多画） */
        let who = '';
        try {
            /* ★Wave B2：跟条目侧同一把锁（`state.lock` = S.lock；探针自造 state 时没有这个键 ⇒ 按老口径，
               免得把"抽出来单独编译"的那套夹具判红）。 */
            const hasLock = !!(state && typeof state === 'object' && Object.prototype.hasOwnProperty.call(state, 'lock'));
            const three = (hasLock ? !!(state.lock && state.lock.state === 'lit')
                : !!(state.analysis && state.analysis.stats && state.analysis.stats.threeWay));
            const why = (PMx.STATUS_LABEL || {})[it.status] || '';
            if (three && why && it.status !== (PMx.STATUS || {}).SAME) {
                who = `<span class="ywpu-chip ywpu-whopill ywpu-st-${escFn(String(it.status))}" title="填了③官方旧版才判得出来（三方对比）；这条的判据：${escFn(why)}">谁改的：${escFn(why)}</span>`;
            }
        } catch (e) { who = ''; }
        const ovr = placeOv[it.key] || null;
        const pend = !!(it.placePending || ovr);
        /* ★Wave G ⑤（作者 P2-3 / P3-1 点名要的那条）：位置待定 → **手选插入点**。
           内核那条路上，这种行（只有我有的）插在哪**就认 `it.place`**（`mergeRegexes` ② 的
           `resolveRegexAnchor(it.place, cur.entries)`）⇒ 界面把用户选的锚点写进 `it.place` 就生效了，
           **不用动内核**。候选 = 最终合并里真有的那些正则（按最终顺序），所以选谁就一定插在谁后面。 */
        const pickHtml = (pend && opts.length) ? (() => {
            const curIdx = ovr ? opts.findIndex(o => String(o.name || '') === String(ovr.name || '')) : -1;
            return `<div class="ywpu-pospick ywpu-rxpospick" data-rxplacefor="${escFn(it.key)}">
        <span class="ywpu-pospick-t">插在哪一条正则后面？</span>
        <input class="ywpu-input ywpu-posq" data-posq="1" placeholder="搜正则名…" title="在最终结果里搜正则名，下面的下拉只剩匹配的">
        <select class="ywpu-input ywpu-poss" data-rxplace="1" title="选中即刻生效：这条就插在你选的那条正则后面（不改 = 按内核判：放最后并标「位置待定」）">
            <option value=""${curIdx < 0 ? ' selected' : ''}>（不改：按内核判 —— 放最后，标「位置待定」）</option>
            ${opts.map((o, i) => `<option value="${i}"${i === curIdx ? ' selected' : ''}>${escFn(o.name || ('第 ' + (i + 1) + ' 条'))}</option>`).join('')}
        </select>
        <span class="ywpu-pospick-now">现在：${curIdx < 0 ? '位置待定（放最后）' : '插在「' + escFn(opts[curIdx].name || '') + '」后面（第 ' + (curIdx + 2) + ' 位）'}</span>
    </div>`;
        })() : '';
        /* ★W95 ④：这一行**点开没点开**（作者原话："不点进去时不显示里边的更改内容…只有点开才显示"）。
           状态放 `state.regexRowOpen[key]`（跟条目侧的 `S.expanded` 同一个路子：**就地重绘不丢**）。
           收起态藏起来的是：开关提示 / 安全理由 / **红蓝上下两组（含查找·替换的具体内容）** / 位置待定的下拉。
           收起态**留着**的是作者点名要的两样：**大标题**（徽标 + 名字 + 位次 + 位置待定 + ⚠）与**下面那排选择**。 */
        const rowOpen = !!(state && state.regexRowOpen && state.regexRowOpen[it.key]);
        return `<div class="ywpu-rxrow${safety && safety.risk === 'danger' ? ' ywpu-rxbad' : ''}${rowOpen ? ' ywpu-rxopen' : ' ywpu-rxclosed'}" data-rx="${escFn(it.key)}"${it.disabledDiff ? ' data-rxdiff="1"' : ''}${rowOpen ? ' data-rxopen="1"' : ''}>
    <div class="ywpu-rxhead2" data-rxtgl="1" title="点一下展开/收起：展开才看这条改了哪里（查找 / 替换那些具体内容）">
        <span class="ywpu-caret">${rowOpen ? '▾' : '▸'}</span>
        ${bs.map(x => `<span class="ywpu-badge ${x.cls}" title="${escFn((PMx.STATUS_LABEL || {})[it.status] || '')}">${escFn(x.text)}</span>`).join('')}
        <span class="ywpu-rxname">${escFn(it.label || '')}</span>
        ${posTag}
        ${it.placePending && !ovr ? '<span class="ywpu-of ywpu-of-pend">位置待定</span>' : ''}
        ${ovr ? '<span class="ywpu-of ywpu-of-set" title="你自己选了插在哪条后面">位置已选</span>' : ''}
        ${safety ? `<span class="ywpu-rxwarn" title="${escFn((safety.reasons || []).join('；'))}">${safety.risk === 'danger' ? '⚠ 危险' : '⚠ 注意'}</span>` : ''}
        ${who}
        ${/* ★W99-乙：「看改了哪里」四个字太长（作者原话："那个词太长 ⇒ 改成一个小的展开标记"）——
             行首那枚 `▸/▾` 就是标记（与条目侧 `.ywpu-item-head` 同一个写法），这枚多余的字标整颗删掉。
             ▲判据锚点（探针/回归按它取数）：`ywpu-rxtgl-t` 这个类**在产品 HTML 里 0 命中**。 */''}
    </div>
    <div class="ywpu-rxmeta">${escFn(regexFlagText(one, PMx))}</div>
    ${/* ★W101-乙⑥：这里原来还有一句 `开关：旧版开 → 新版关`（只在"正文一字未动、只有开关不同"
         的行上给，W100-丁加的短标签）—— **整句删掉**：同一个信息说第二遍，而展开区
         「开关变化」那块（`rxDimChoiceHtml()`）就在下面、还能直接点选（与条目侧逐字同一个口径）。 */''}
    ${safety ? `<div class="ywpu-rxwhy">${escFn((safety.reasons || []).join('；'))}</div>` : ''}
    ${/* ★W101-乙⑦（作者给的口径："点选逻辑要和条目一样…要学习全套"）：这一行也有一颗
         「还有 N 处没选 / ✓ N 处都选过了」的计数 chip（与条目侧 `.ywpu-pickbar` 那颗同一套类、
           同一条内核判据 `regexItemDecided`）—— 它紧跟在那排按钮后面、在三块选择的前面，
           与条目侧 W101-甲④ 的次序（① 按钮 → ② 计数 → ③ 名字 → ④ 开关 → ⑤ 内容）逐字一致。
         ★`total === 0`（这条不用你选）⇒ 整颗不画。 */''}
    ${pg.total ? `<div class="ywpu-pickbar"><span class="ywpu-chip ${pg.left ? 'ywpu-c-decide' : 'ywpu-c-same'}">${pg.left ? `还有 <b>${pg.left}</b> 处没选` : `✓ ${pg.total} 处都选过了`}</span></div>` : ''}
    ${/* ★W99-甲：开关 / 名字两个维度的选择块（与条目侧 `dimChoiceHtml()` 同一套骨架）——
         位置在"更改内容"那块的**前面**，与作者原话"除了内容，前面还可以插入"一致。
         ★收起态照旧留在 DOM 里（与 `.ywpu-rxdiff` 同一个口径：靠 CSS 的 `.ywpu-rxclosed` 那组
           `display:none` 藏起来）⇒ W95 那套"收起态不显示具体内容"的读数一条不受影响。 */''}
    ${rxDimChoiceHtml(it, d, escFn)}
    ${rxDiff}
    ${pickHtml}
    <div class="ywpu-rxpick">
        <!-- ★§BY-F：按"左旧右新"重排（改前是 用新版|用我的|两条都留）—— data-rxact 三个值一个没变，
             只换顺序；"两条都留"居中（与条目行那颗「保存为两版」同一个位置口径）。
             ★Wave G ③b：只有我有的那条走「保留 | 不要」（跟条目侧一字不差）；
               "开关不同"那条走「还原旧状态 | 保持新状态」（data-rxen，写 enabled）。 -->
        ${picksOf(it, d)}
    </div>
</div>`;
    };
    /* ★★W99-丁（2026-10-06 · 作者实测原话）："它为什么**显示第16位，但位置却是在下面**……**待我处理的时候
       你不要这样子帮我归类**、不要把某些东西划分区域"。
       现场（W99 探针在真预设对 `C6-用户自改V0811` VS `P1-用户（2）` 上量的）：
         · 改前这一串行的顺序 = `items` 顺序 = [配上的对（按新版顺序）] + [**只有我有**…] + [**新版新增**…]
           ⇒ 用户自己那 15 条正则**整批堆在列表最末尾**（第 36~50 行），
           而行上的「第 N 位」徽标（= 最终清单里的位次）说它们在**第 5~38 位**一带 ⇒
           **"显示第16位、位置却在下面"就是这么来的**（一行显示第 12 位、实际排在第 22 行；实测读数见报告 §丁）。
       修法：**按每行自己那枚徽标的读数排**（`posOf()` —— 与 posTag 同一个函数、同一份 `state.regexPos`，
       而 `state.regexPos` = 内核 `mergeRegexes()` 真跑一遍的最终清单）：
         · 查得到位次的行 → 按位次升序；
         · 查不到（id 换了、名字不唯一那种）→ 保持在 `items` 里的相对次序，**接在查得到的那些后面**
           （宁可不说也不乱说，与 posTag "算不出来就不画"同一条纪律）；
         · 「只有我有的」那种本来就是按内核 `regexPlaceOf` 的锚点进的最终清单 ⇒ 它们的位次就是真位次，
           不再被搬到末尾 —— 作者举的那条"第16位"就落回第 16 位那一带。
       ★过滤 ≠ 重排：这一步只定**画出来的先后**，筛选那一排（`F.match`）照旧只挑行、不动次序。 */
    const orderRows = (arr) => {
        const posOfKey = new Map();
        for (const it of arr) {
            let p = null;
            try { p = posOf(it); } catch (e) { p = null; }
            if (p) posOfKey.set(it.key, p);
        }
        if (!posOfKey.size) return arr;
        /* ★W112 实测（作者 2026-10-07 报"每一种都聚在一块"时一起查的）：下面这个"算不出位次 → 接在最后"
           的兜底，**在产品可达的状态里根本走不到** —— 探针把「两条都留」4 条 + 「不要」4 条都用真按钮点过，
           `posOf` 依然条条算得出（0/54 行没徽标；因为 `use:'both'` 的旧版副本换了 id，'
           用我的' 那份的 id 就在清单里 ⇒ 每条都还剩**恰好一个** id 命中）。
           ⇒ **按"没有读数证明要改"这一条纪律，这里一个字都不改**（照旧 `Number.MAX_SAFE_INTEGER` 接尾）。
             哪天它真出现了（id 丢了 + 名字还重了），它只是排在末尾、徽标照旧不画 —— 不会说谎。 */
        return arr.map((it, i) => ({ it, i })).sort((A, B) => {
            const pa = posOfKey.has(A.it.key) ? posOfKey.get(A.it.key) : Number.MAX_SAFE_INTEGER;
            const pb = posOfKey.has(B.it.key) ? posOfKey.get(B.it.key) : Number.MAX_SAFE_INTEGER;
            return (pa - pb) || (A.i - B.i);              // 位次相同/都查不到 → 保持原相对次序（稳定）
        }).map(x => x.it);
    };
    const needRows = orderRows(listItems.filter(needs));
    const sameRows = orderRows(listItems.filter(it => !needs(it)));
    /* ★Wave H₂ ①（保留）+ ★Wave W2 ①（扩成"照抄条目区那一排"）+ ★W112（作者 2026-10-07 白天）：
       · `pending`（**默认**，「待我处理」）：跟 H₂ 那版**逐字一样** —— 只画"要你看的"，
         "两边一样"那批照旧折进 `另有 N 条两边一样（点开看）`（Wave G ⑥ 的形态）；
       · `all`（「全部」，= 点一次当前那颗取消）：把那一批**平铺**进同一串（`<details>` 拆掉）；
       · 其余各档（新版新增 / 只有我有 / 两边不同 / 开关不同 / 改了名字）：按 `F.counts` 那一套**同一个判定**
         挑行，平铺（那几档本来就不含"两边一样"，没有可折的东西）。
       ★★以上每一档的**行序 = 自然序**（每行自己那枚「第 N 位」徽标升序）—— 与「待我处理」档、
         与条目区那把尺子**同一个口径**（`orderRows()` = 按最终清单位次排，就是本函数下面那一段）。
       ▲**W112 修的就是这里**：改前只有 `pending` 那一支过了 `orderRows`，`all` 与"各档筛选"两支直接吃
         `listItems`（= 内核 `analyzeRegexes` 产物顺序 = **[配上的对…] + [只有我有…] + [新版新增…]**）
         ⇒ 同一类整批挨在一起（"每一种都聚在一块"），而它们行上的「第 N 位」说的是**中间的位置**
         （作者原话："那些缝进来要变动的 顺位本来在中间 但是现在每一种都聚在一块"；
          实测：4 条缝进来的新版正则在「全部」档被堆到第 51~54 行，而徽标说它们在**第 35/41/42/47 位**）。
         Wave H₂ 当年那句"每行的「第 N 位」连起来就是整份顺序"**是个没兑现的假设** —— 现在真兑现了。
       ★各档都不改行的渲染（`rowHtml`）、不改位次（`posTag`）—— 换只换"画哪些行、按什么次序画"。 */
    const showRows = (active === 'pending') ? needRows
        : orderRows(allMode ? listItems : (F && F.match ? listItems.filter(it => F.match(it, active)) : needRows));
    const rows = showRows.map(rowHtml).join('');
    const sameFold = (active === 'pending' && sameRows.length)
        ? `<details class="ywpu-rx-same"${(state && state.regexSameOpen) ? ' open' : ''}>
        <summary title="两边一模一样的正则（一条都不用管）——点开照旧逐条看得见">另有 ${sameRows.length} 条两边一样（点开看）</summary>
        <div class="ywpu-rxlist">${sameRows.map(rowHtml).join('')}</div>
    </details>`
        : '';
    /* ★W107-②（最新口径）：下面这段 Wave W2 ① 的"照抄一排"**被本轮撤掉了** —— 那一排整条删除（作者："不要多出任何东西"），
       计算 / 操作统一走顶部那排。以下文字只留给回滚时对口径；产品代码里这些渲染件已不再被本块调用。 */
    /* ★★Wave W2 ①（2026-09-24 · 作者第 20 批）：**筛选那一排 + 两颗"一键"，照抄条目区那一排**。
       作者原话："你就不能像前边的那个条目一样，就在那个地方放好 一键选旧版 一键选新版 全部 待我处理
       新版新增 只有我有 两边不同 开关不同 这种吗？就是直接把它 copy 下来不就好了吗，它的逻辑呀，全部逻辑 copy 下来"
       · 这一排的 HTML **完全由 `F` 提供**（`REGEX_FILTER_UI` = 条目区用的那两支函数现绑：`filterChipsHtml()` /
         `bulkBtnsHtml()`）⇒ 两排的标签、顺序、配色、按钮文案、点自己=取消 的口径**永远一致**，不新造一套；
       · **默认选「待我处理」**（= `regexFilter` 的默认值 `'pending'`）；再点它一次 ⇒ `'all'`（显示全部）；
       · 两颗"一键"只在**真有可选项**时才画（与条目区 Wave G ② 同一条规矩）；
       · 只在展开态画（收起来时它没有意义，也不给首屏/整页几何添乱 —— 与 H₂ 那颗 chip 同一个位置口径）。 */
    /* ★★W107-②（作者原话："下面居然又有一整条……一键选新版 一键选旧版 然后还有什么正则30多条 内容不同多少条
       只有我有多少条 新版新增多少条 然后还有右边那个保留只有我有 丢弃只有我有……这些筛选内容为什么又多一遍呢？
       我觉得统一的就用上面的来计算以及操作就好了呀"）：整条 `.ywpu-rxbar`（折叠颗 + 计数句 + 一键四颗 +
       复制的一排筛选）**全删** ⇒ 这里只剩行本体（外层 `.ywpu-rxbox` 只是排版壳，给行间距用）。
       计算 / 操作 / 筛选统一走顶部那排（范围开关 / 筛选 chips / 一键四颗 —— W103-戊 起它们本就"管全部"）。
       `F.bulk` / `F.chips` 两个渲染件从此不被调用（`F.match` 照旧收行）。
       ▲判据锚点：本函数**产物（画出来的 DOM）**里 `ywpu-rxbar` / `ywpu-rxtoggle` / `ywpu-rx-bulk` **恰好 0 命中**
       （W107 探针按 DOM 取数）。★源码里这几个字符串只剩注释与 `regexFilterUI()` 那两个**不再被调用**的渲染件（老探针的口子）。 */
    return `<div class="ywpu-rxbox"><div class="ywpu-rxlist">${rows}${sameFold}</div></div>`;
}
/* ==== ywpu-regex-core:end ==== */

/** ★Wave G ⑤：手选插入点的**候选**（= 最终合并里真有的那些正则，按最终顺序）。
 *  为什么现算：`place.afterName` 是内核按**结果清单里的名字**去认的（`resolveRegexAnchor`），
 *  拿"行上显示的名字"当候选会有认不上的时候（比如这一条选了"用我的"，结果里就是你的那个名字）
 *  ⇒ 只有把**真·最终清单**端出来当候选，用户选谁就一定插在谁后面。
 *  成本：只有"这一块真有位置待定的行"时才算（平时一个字节都不算）。 */
function regexPlaceOptionsNow() {
    const items = S.regexItems || [];
    const hasPend = items.some(it => it.placePending || (S.regexPlace || {})[it.key]);
    if (!hasPend) return [];
    try {
        const arg = regexArgForBuild() || { items, decisions: S.regexDecisions || {} };
        const m = PM.mergeRegexes({ mine: S.mine, next: S.next, base: S.regexBase || S.base || null, items: arg.items, decisions: arg.decisions });
        const pendIds = new Set(items.filter(it => it.placePending).map(it => String((it.mine && it.mine.script && it.mine.script.id) || '')));
        return (m.list || [])
            .filter(r => !(r.id && pendIds.has(String(r.id))))          // 待定那几条自己不能当自己的锚点
            .map(r => ({ id: String(r.id || ''), name: String(r.scriptName || ''), find: String(r.findRegex || '') }));
    } catch (e) {
        console.warn('[预设更新器] 算"插在哪条后面"的候选失败（不影响别的）', e);
        return [];
    }
}

/** ★Wave H₂ ①（作者第二十批）：**每条正则"在最终预设里排第几"**的位次表。
 *  · 数据源 = 内核最终的 `mergeRegexes().list`（**跟 Wave G ⑤"手选插入点"的候选完全同一份**），
 *    所以"位次"跟着用户的选择走（点一次「用新版」位次就该变 —— 这是对的，结果本来就变了）。
 *  · 只在正则块真打开时算（`renderRegexBox` 里调一次）；按 `decisions + regexPlace` 的**签名记忆化**，
 *    签名没变就直接复用（同一帧里多次重画不重复算）。
 *  · 代价实测（`e2e/tmp/waveH2-rx-cost.js`，作者真身夹具 50 条正则）：`mergeRegexes` 中位 **0.83ms** + 建表 0.03ms
 *    ⇒ 远低于 plan §C.2 给的 30ms 代价门，**两态都算也不心疼**（不需要"只在取消筛选时才算"）。
 *  · 取位次的阶梯（与"说不准就不说"同一条纪律）：① 正则 `id` 命中 → ② 归一化名字**唯一** → ③ 不显示。 */
function regexPosMapNow() {
    const sig = JSON.stringify(S.regexDecisions || {}) + '|' + JSON.stringify(S.regexPlace || {});
    if (S.regexPos && S.regexPos.sig === sig) return S.regexPos;
    const out = { sig, byId: new Map(), byName: new Map(), total: 0, normName: null };
    try {
        const items = S.regexItems || [];
        if (items.length) {
            const arg = regexArgForBuild() || { items, decisions: S.regexDecisions || {} };
            const m = PM.mergeRegexes({ mine: S.mine, next: S.next, base: S.regexBase || S.base || null, items: arg.items, decisions: arg.decisions });
            const list = (m && m.list) || [];
            out.total = list.length;
            out.normName = PM.normalizeName || null;
            list.forEach((r, i) => {
                const s = PM.normalizeRegexScript ? PM.normalizeRegexScript(r) : r;
                if (!s) return;
                if (s.id) out.byId.set(String(s.id), i + 1);
                const nk = PM.normalizeName ? PM.normalizeName(s.scriptName) : String(s.scriptName || '');
                if (nk) { const a = out.byName.get(nk) || []; a.push(i + 1); out.byName.set(nk, a); }
            });
        }
    } catch (e) {
        console.warn('[预设更新器] 算"正则第几位"失败（不影响别的：徽标不画）', e);
    }
    S.regexPos = out;
    return out;
}

/** ★Wave W2 ①：正则那排要用的**筛选适配器 + 那一排的渲染件**（唯一一处把"两排共用"接起来的地方）。
 *  ★W107-②：正则块那排**已删** —— 本函数产品里只剩 `match`（收行）与 `rx`（并集计数）两个消费者在用；
 *    `chips` / `bulk` / `moRx` 保留只为老探针与 `__ywpu.regex.ui()` 口子（老断言零影响、且不会误导回滚）。
 *  · `match(it, id)` = 条目区那支 `matchFilter()`（同一支函数），带上正则侧的适配器 `rx`；
 *  · `counts(items)` = 条目区那支 `filterCountsOf()`；
 *  · `chips(counts, active)` = 条目区那支 `filterChipsHtml()`（只是点击锚点属性换成 `data-rxfilter`）；
 *  · `bulk(active)` = 条目区那支 `bulkBtnsHtml()`（id 换成正则那两颗；title 里的"范围"改成"全部正则、不影响条目"）；
 *  · `active` = 当前选中哪一档（正则侧那颗高亮靠它）。
 *  ★为什么把 `match` 也包一层：正则的"待我处理"要看 `S.regexTouched`（"你亲手点过没"），
 *    条目侧那一档看的是内核 `itemDecided` —— 差异写在 `matchFilter()` 的注释里，判定函数还是同一支。 */
function regexFilterUI() {
    /* ★★W99-丙（作者原话："我不是说**不要默认有选择**吗？……**不要默认**"）：
       改前这里的"还没选"判据是**"不在亲手点过名单里"**（`S.regexTouched`）—— 之所以要那份名单，
       是因为 `S.regexDecisions` 一进页面就被**兜底值预填**（`analyzeRegexesIntoState` 写的），
       于是"用新名字 / 还原旧状态 / 用我的 / 保留 / 加进来"这些按钮**一开始就亮着**（作者点名的就是这五个）。
       现在预填**整个去掉**（决策表一开始是空的）+ 判据换成**内核那支 `regexItemDecided()`**
       —— 与条目侧 `isPending` 逐字同一个口径（"三个维度都亲手选过"才算完）。
       `regexTouched` 照旧维护（一键的"会丢多少活儿"那份读数还在用它），但**不再决定**"还没选"。 */
    const rx = { pending: (it) => !!(PM.regexNeedsChoice(it) && !PM.regexItemDecided(it, (S.regexDecisions || {})[it.key])) };
    const counts = (items) => filterCountsOf(items, PM, rx);
    /* ★W14 ②③：正则侧那两颗新按钮（与条目侧同款；只在真有「只有我有」的正则时才画）。 */
    const moRx = {
        n: mineOnlyRxItems(S.regexItems).length,
        active: mineOnlyRxModeOf(S.regexItems, S.regexDecisions, S.regexTouched),
        ids: { keep: 'ywpu-rx-mokeep', drop: 'ywpu-rx-modrop' },
        tips: {
            keep: '把正则里「只有我有」的整条**保留**（新预设里照旧留着）。只动这几条，其它正则与条目一个都不碰。再点一次同一颗 = 取消（回到「还没选」）。',
            drop: '把正则里「只有我有」的选成「不要」（丢弃：新预设里不留这几条）。只动这几条，其它正则与条目一个都不碰。再点一次同一颗 = 取消（回到「还没选」）。',
        },
    };
    return {
        rx, active: String(S.regexFilter || 'pending'),
        /* ★两颗"一键"的高亮 = **现在全部正则是不是都在那一版**（`bulkRxModeOf` 现算；改前读的是
           `S.regexBulkSide` 那个状态位 —— 逐行点按钮 / 换基准重算都不会动它 ⇒ 高亮会说谎，见 W17C）。
           ★W103-戊：判据扩到两摊（跟上面那排用的是同一支 `sideModeAllNow`）。 */
        bulkActive: sideModeAllNow('mine') ? 'mine' : (sideModeAllNow('next') ? 'next' : null),
        match: (it, id) => matchFilter(it, id, PM, rx),
        counts,
        chips: (c, active) => filterChipsHtml(c, active, 'data-rxfilter'),
        bulk: (active) => bulkBtnsHtml(active, 'ywpu-rx-bulk-mine', 'ywpu-rx-bulk-next',
            '每一条正则都按你的（旧版）来：新版删掉的**保留**、只有我有的**留着**、开关**还原旧状态**、两边都改过的**整条用我的**。★会覆盖你逐条挑过的正则选择与你手选的插入点（不可撤销）。范围 = **全部正则 + 全部条目**（这条线现在管全部），不管你现在筛没筛。再点一次同一颗 = 全部取消选择（回到「还没选」，**不是**还原）',
            '每一条正则都按新版来：新版新增的**加进来**、只有我有的**跟随删除**、开关**以新为准**、两边都改过的**整条用新版**。★会覆盖你逐条挑过的正则选择与你手选的插入点（不可撤销）。范围 = **全部正则 + 全部条目**（这条线现在管全部），不管你现在筛没筛。★点「一键选新版」时**不碰「只有我有的」**（那几条要你自己点右边那两颗）。再点一次同一颗 = 全部取消选择（回到「还没选」，**不是**还原）', moRx),
    };
}

/** 把上面那块挂进页面（**挂在 #ywpu-params 里面** = 条目列表下面，位置不抢条目那套）
 *  ★Wave G ①：条目区收成一句话时，这块自然就顶到首屏（DOM 顺序没动 ⇒ 老几何断言零影响）。 */
function renderRegexBox(host) {
    const h = host || $el('#ywpu-params');
    if (!h) return;
    /* ★★W110-B（作者原话："这两个折叠条是永远不消失的 我可以随时点击这两个折叠条把它展开收起……
       都是一个折叠条是预设条目多少条 需要你选多少条 然后下面那个是正则条目多少条 需要你选多少条 样式是一样的"）：
       正则侧也补一根**和条目侧一模一样**的常驻条（同一套 `.ywpu-rxbar.ywpu-scopebar`、同一句 `正则条目 N 条 ·
       需要你选 M 条`）—— 收起态 = 只有它；展开态 = 它当列表头，下面直接就是行。
       ★覆盖面（一条都不许漏）：① 这一摊**一条正则都没有**时**不画条**（没有东西可收/展）；
       ②「正则条目」关着时**只画这根条**（不再是"什么都不画"—— W110-B 改的就是这一点，作者点名要的）；
       ③ 展开时 = 条 + 行。`S.regexOpen` 仍是**只读镜像**（= 这块正画着吗，不含收起态的条）。 */
    const rxN = (S.regexItems || []).length;
    if (!rxN) {                                             // 这一摊根本没有内容 ⇒ 条也不画（与老口径一致）
        S.regexOpen = false;
        const old0 = h.querySelector('#ywpu-rx-host'); if (old0) old0.remove();
        return;
    }
    const rxBar = () => scopeBarHtml('rx', rxN, scopeNeedCount('rx'), S.scopeRx !== false);
    let box = h.querySelector('#ywpu-rx-host');
    if (S.scopeRx === false) {
        S.regexOpen = false;
        if (!box) { box = document.createElement('div'); box.id = 'ywpu-rx-host'; h.appendChild(box); }
        box.innerHTML = rxBar();
        bindScopeBar(box, 'rx');
        applyAutoInkAll();
        return;
    }
    S.regexOpen = true;
    S.regexPlaceOpts = regexPlaceOptionsNow();
    S.regexPos = regexPosMapNow();          // ★Wave H₂ ①：位次表（只在展开时才算，见那边的代价实测）
    const html = regexBoxHtml(S, PM, esc, regexFilterUI());   // ★W107-②：F 里只有 match 还在用（chips/bulk 随外框删）
    if (!html) { if (box) box.remove(); return; }             // 理论上到不了（rxN>0 ⇒ 必有行）；兜底不留空壳
    if (!box) { box = document.createElement('div'); box.id = 'ywpu-rx-host'; h.appendChild(box); }
    box.innerHTML = rxBar() + html;                           // ★W110-B：条 + 直接是行
    bindScopeBar(box, 'rx');                                  // ★W110-B：这根条的点击（与顶部那颗开关同一个键）
    /* ★★W107-②：`#ywpu-rx-toggle`（整块折叠颗）、`data-rxfilter`（复制的那排筛选）与那四颗"一键"
       （`ywpu-rx-bulk-*` / `ywpu-rx-mokeep|modrop`）的绑定**随外框一起删** —— 开/关交给顶部「正则条目」，
       筛选交给顶部那排 chips（`data-filter`，两摊一起筛），"一键"四颗由顶部那排负责（W103-戊 起它们本就管全部）。
       ▲判据锚点：**绑定的落点没了**（DOM 里 `#ywpu-rx-toggle` / `[data-rxfilter]` 元素恰好 0 —— W107 探针按 DOM 取数）；
       源码里这两个名字只剩注释与 `regexFilterUI()` 的保留口子。 */
    /* "两边一样"那批的折叠状态：因为每次点击都是**就地重绘**，不记住的话用户刚点开就被折回去 */
    const sameFoldEl = box.querySelector('.ywpu-rx-same');
    if (sameFoldEl) sameFoldEl.addEventListener('toggle', () => { S.regexSameOpen = !!sameFoldEl.open; });
    /* ★Wave G ④：亲手点过的那一份名单（★W99-戊：**取消也要记** —— `seen(key,false)` 把这一条摘掉，
       让它回到"还没选"。改前它只增不减 ⇒ 取消之后"待我处理"的计数与按钮高亮对不上）。 */
    const seen = (key, on = true) => {
        const t = { ...(S.regexTouched || {}) };
        if (on) t[key] = true; else delete t[key];
        S.regexTouched = t;
    };
    /* ★W95 ④：点**大标题那一行** = 展开/收起这一条（跟条目侧 `.ywpu-item-head` 同一个手法：
       整行可点 + 行首一枚 `▸/▾`）。★不是 `<button>` —— 这样 `querySelectorAll('button')` 的顺序
       跟改前**逐字一样**（r9h 那类按序号取"第 N 颗按钮"的老断言不会错位）。
       点按钮不展开：`.ywpu-rxpick` / `.ywpu-rxpospick` 都不在 `.ywpu-rxhead2` 里 ⇒ 天然互不干扰。 */
    box.querySelectorAll('.ywpu-rxhead2[data-rxtgl]').forEach(h2 => h2.addEventListener('click', function () {
        const row = this.closest('.ywpu-rxrow');
        const key = row && row.getAttribute('data-rx');
        if (!key) return;
        /* ★W107-②a：顶部那排的「单条」也管这一摊（"都能作用于当前显示的那一摊"）—— 与条目侧
           `handleItemAction` 里那两行逐字同一个手法：手风琴开着时，展开一条 = 先把别的收起来。
           ★只收自己这摊（条目侧 `S.expanded` 与这里 `S.regexRowOpen` 互不牵连）。 */
        const on = !(S.regexRowOpen || {})[key];
        if (on && getSettings().accordion !== false) S.regexRowOpen = {};
        const next = { ...(S.regexRowOpen || {}) };
        if (on) next[key] = true; else delete next[key];
        S.regexRowOpen = next;
        renderRegexBox(h);
    }));
    /* ★Wave G ③（作者实测的真语义 BUG）：点「用新版 / 用我的」时，**开关那一维也要一起落地**。
       ★★W99-甲（2026-10-06 · 作者"要选完所有的"）**改了这条口径**：开关现在是**独立的一维**
       （行里那两组 `data-rxdim`/`data-rxen`、或展开区那两块），所以这里**不再顺手写 enabled** ——
       写 `enabled` 就成了"隐性默认"（作者原话："我不是说不要默认有选择吗？……不要默认"）。
       内核 `regexItemDecided()` 会在 `enabled` 缺省时判这条**仍未选完**（行/区上那两组块会一直亮着等人点），
       不会再出现"按钮亮了、开关却一动不动"那种误解（那正是 Wave G ③ 当初要修的现象 —— 现在改成
       "没选就不算选完"，比"顺手替他选"更符合作者本轮的口径）。
       ★★W99-戊（作者原话："你点击进去它会帮你选，**再点击一次它会帮你取消选择** —— 它的逻辑**要跟
       上面的条目一样**。现在那个正则**是有bug的**……它并没有帮我取消掉"）：现在这一支**可取消** ——
       点亮的再点 = `delete use`（= 回到"还没选"，与条目侧 `opt-mine/opt-next` 那三颗逐字同一个口径）。 */
    box.querySelectorAll('button[data-rxact]').forEach(b => b.addEventListener('click', function () {
        const row = this.closest('.ywpu-rxrow');
        const key = row && row.getAttribute('data-rx');
        if (!key) return;
        const use = this.getAttribute('data-rxact');
        const cur = S.regexDecisions[key] || {};
        const nxt = { ...cur };
        if (cur.use === use) { delete nxt.use; seen(key, false); }         // 再点同一个地方 = 取消
        else { nxt.use = use; seen(key, true); }
        S.regexDecisions[key] = nxt;
        S.regexPos = null;
        renderRegexBox(h);
    }));
    /* ★Wave G ③："开关不同"那一行的两颗（`data-rxen`）—— 只写 `enabled`（跟条目侧那两颗同一个口径）
       ★W99-戊：**可取消**（点亮的再点 = 清掉 `enabled` ⇒ 这一行回到"还没选"）。 */
    box.querySelectorAll('button[data-rxen]').forEach(b => b.addEventListener('click', function () {
        const row = this.closest('.ywpu-rxrow');
        const key = row && row.getAttribute('data-rx');
        if (!key) return;
        const want = (this.getAttribute('data-rxen') === 'mine' ? 'mine' : 'next');
        const cur = S.regexDecisions[key] || {};
        const nxt = { ...cur };
        if (cur.enabled === want) { delete nxt.enabled; seen(key, false); }   // 再点同一个地方 = 取消
        else { nxt.enabled = want; seen(key, true); }
        S.regexDecisions[key] = nxt;
        S.regexPos = null;
        renderRegexBox(h);
    }));
    /* ★★W99-甲：展开区那两组块（`rxDimChoiceHtml()` 产出的 `data-rxdim="en|name"` + `data-side`）——
       与行里那两组按钮写的是**同一份决策表**的同一个键（`enabled` / `name`），点亮的再点 = 取消。 */
    box.querySelectorAll('.ywpu-grp[data-rxdim]').forEach(g => g.addEventListener('click', function () {
        const row = this.closest('.ywpu-rxrow');
        const key = row && row.getAttribute('data-rx');
        if (!key) return;
        const dim = this.getAttribute('data-rxdim') === 'name' ? 'name' : 'enabled';
        const want = this.getAttribute('data-side') === 'mine' ? 'mine' : 'next';
        const cur = S.regexDecisions[key] || {};
        const nxt = { ...cur };
        if (cur[dim] === want) { delete nxt[dim]; seen(key, false); }         // 再点同一组 = 取消
        else { nxt[dim] = want; seen(key, true); }
        S.regexDecisions[key] = nxt;
        S.regexPos = null;
        renderRegexBox(h);
    }));
    /* ★★W101-乙⑦（作者原话："正则部分**里面的选择逻辑 根本没有实现** —— 要可以**直接点选**啊，
       而且**点选逻辑要和条目一样**啊，**要学习全套**"）：
       展开区里"更改内容"那两组（`data-rxuse`，由 `regexDiffHtml()` 画）现在**真的能点**了 ——
       点一组 = 结果里用那一版（写 `d.use`，与那排按钮**同一个键**）；**再点同一组 = 取消**（`delete use`，
       与条目侧 `pickBlockSide()` 的两行一字不差）；点完就地重绘 ⇒ 那组盖上圆勾章 ✓、另一组变暗
       （CSS 复用的就是条目侧那三条规则，本波把 `.ywpu-rxgrp` 上"关掉交互"的三行删了）。
       ★`use === 'both'`（点过「两条都留」那颗按钮）⇒ 两组都盖章、都不变暗。 */
    box.querySelectorAll('.ywpu-grp[data-rxuse]').forEach(g => g.addEventListener('click', function () {
        const row = this.closest('.ywpu-rxrow');
        const key = row && row.getAttribute('data-rx');
        if (!key) return;
        const want = this.getAttribute('data-rxuse') === 'mine' ? 'mine' : 'next';
        const cur = S.regexDecisions[key] || {};
        const nxt = { ...cur };
        if (cur.use === want) { delete nxt.use; seen(key, false); }         // 再点同一组 = 取消
        else { nxt.use = want; seen(key, true); }
        S.regexDecisions[key] = nxt;
        S.regexPos = null;
        renderRegexBox(h);
    }));
    /* ★★W99-甲：行里那两颗「用旧名字 / 用新名字」（`data-rxname`）—— 名字那一维的快捷入口，
       与上面那两组块同一个键；点亮的再点 = 取消。 */
    box.querySelectorAll('button[data-rxname]').forEach(b => b.addEventListener('click', function () {
        const row = this.closest('.ywpu-rxrow');
        const key = row && row.getAttribute('data-rx');
        if (!key) return;
        const want = this.getAttribute('data-rxname') === 'mine' ? 'mine' : 'next';
        const cur = S.regexDecisions[key] || {};
        const nxt = { ...cur };
        if (cur.name === want) { delete nxt.name; seen(key, false); }         // 再点同一颗 = 取消
        else { nxt.name = want; seen(key, true); }
        S.regexDecisions[key] = nxt;
        S.regexPos = null;
        renderRegexBox(h);
    }));
    /* ★Wave G ⑤：位置待定的行 → 手选"插在哪一条正则后面"（写进 `it.place`，内核照单收） */
    box.querySelectorAll('.ywpu-rxpospick').forEach(p => patchPosQ(p, p.querySelector('[data-rxplace]')));   // 那个"搜正则名"的过滤框（跟条目侧同一个实现）
    box.querySelectorAll('[data-rxplace]').forEach(sel => sel.addEventListener('change', function () {
        const row = this.closest('.ywpu-rxrow');
        const key = row && row.getAttribute('data-rx');
        if (!key) return;
        const list = S.regexPlaceOpts || [];
        const i = this.value === '' ? -1 : Number(this.value);
        const next = { ...(S.regexPlace || {}) };
        if (i < 0 || !list[i]) {
            delete next[key];
            toast('info', '这条又回到「位置待定」（生成时放最后）—— 想换个地方随时再选');
        } else {
            next[key] = list[i];
            toast('success', '位置改好了：这条会插在「' + list[i].name + '」后面 —— 生成时按这个顺序落盘');
        }
        S.regexPlace = next;
        renderRegexBox(h);
    }));
}

/** 生成/缝入时交给内核的正则参数（**没正则时返回 null** = 老调用方一个字不变）
 *  ★Wave G ⑤：把用户手选的插入点**合进 items**（内核认 `it.place`）—— 只改这一份副本，`S.regexItems` 一个字不动。 */
function regexArgForBuild() {
    if (!S.regexItems || !S.regexItems.length) return null;
    const ov = S.regexPlace || {};
    const items = S.regexItems.map(it => {
        const o = ov[it.key];
        if (!o) return it;
        return {
            ...it,
            place: { afterId: String(o.id || ''), afterName: String(o.name || ''), afterFind: String(o.find || ''), afterIndex: null },
            placePending: false,
        };
    });
    return { items, decisions: S.regexDecisions || {} };
}

const decOf = (it) => S.decisions[it.key] || {};
// ★"处理完了没有"统一交给内核判定（v3.9：只有"开关不同"的条目点过 保持新状态/还原旧状态 也算处理完）
const isPending = (it) => PM.needsChoice(it) && !PM.itemDecided(it, decOf(it));

/** 按"预设里的先后顺序"排（用户从上往下看就是预设的顺序），不再按状态分组 */
function buildPosMap(an) {
    const map = new Map();
    const keyByMineId = new Map(an.items.filter(i => i.mine).map(i => [String(i.mine.identifier), i.key]));
    const byKey = new Map(an.items.map(i => [i.key, i]));
    let cursor = -1;
    for (const o of an.mineIdx.orderList) {
        const key = keyByMineId.get(String(o.identifier));
        if (!key) continue;
        const it = byKey.get(key); if (!it) continue;
        if (it.next && it.next.orderIndex >= 0) cursor = it.next.orderIndex;
        else cursor = cursor + 0.5;                 // 只有我有的 → 挂在我顺序里的前一条之后
        map.set(key, cursor);
    }
    // ★不在"我的顺序"里的条目：优先用新版的位次；两边都没有（orderIndex = -1）→
    //   绝不能算成 (-1 + 0.9) = -0.1 挤到最前面（用户实测的"乱序"就是这个：13 条挤在 -0.1），
    //   改成按它在预设 prompts 里的原始次序放到最后，顺序还稳定。
    for (const it of an.items) {
        if (map.has(it.key)) continue;
        if (it.next && it.next.orderIndex >= 0) { map.set(it.key, it.next.orderIndex + 0.9); continue; }
        if (it.mine && it.mine.orderIndex >= 0) { map.set(it.key, it.mine.orderIndex + 0.9); continue; }
        const idx = it.next ? it.next.index : (it.mine ? it.mine.index : 0);
        map.set(it.key, 5e5 + idx);
    }
    return map;
}

function visibleItems() {
    const an = S.analysis;
    if (!an) return [];
    const kw = S.search.trim().toLowerCase();
    if (!S.posMap) S.posMap = buildPosMap(an);
    /* ★V③（AR6② · "假拖动"的**根因**就在这几行）：用户手调过顺序（`S.orderOverride`）就**按它排**。
       改前只按"预设里的位置"（posMap）排 ⇒ 在条目页把一条拖走、`renderList()` 一重绘立刻弹回原地 ——
       作者看到的正是"假拖动：拖完只在上面跳一句提示，根本不知道自己拖到哪"。
       没手调过（override 空）⇒ 一个字都不变（老口径零回归，判据也一个字没动）。
       ★两把尺子同一个刻度：`posOf` 是"在结果顺序里的位置"，`rank` 也是 —— 所以**不在** override 里的
       条目（你标了"不要"的那些）继续按 posOf 插在它本来该在的地方，不会被甩到末尾。 */
    const ovrRank = (Array.isArray(S.orderOverride) && S.orderOverride.length)
        ? new Map(S.orderOverride.map((id, i) => [String(id), i]))
        : null;
    const rankOf = (it) => {
        if (!ovrRank) return -1;
        const id = String(mergedIdentOfItem(it) || '');
        return (id && ovrRank.has(id)) ? ovrRank.get(id) : -1;
    };
    return an.items.filter(it => {
        const nm = (it.next?.name || it.mine?.name || '');
        if (kw && !nm.toLowerCase().includes(kw)) return false;
        if (it.mineEmpty && it.nextEmpty && S.filter !== 'empty') return false;   // 纯空条目默认不打扰
        // ★"待处理"= 还没定的 + **已经定过的**（后者半透明留在原位）——用户："处理完不要消失"
        if (S.filter === 'pending') return matchFilter(it, 'pending', PM) || (PM.needsChoice(it) && !!decOf(it).source);
        /* ★W19A ②（作者第 24 批 ② 的真现场）：**筛选一被"处理过的条目"污染**。
           改前这一行是 `return matchFilter(it, S.filter, PM) || !!S.keepVisible[it.key];` ——
           `S.keepVisible` 是"刚处理过的条目"的累计表（点过 用新版/用我的/保存为两版/一键/丢弃… 就记一笔，
           整个会话**从不清**），于是**每一档分类筛选**（新版新增 / 只有我有 / 两边不同 / 开关不同 / 改了名字）
           都会把它连同不属于这一类的行一起列出来。作者原话："我不管筛选哪一个 它都包含了所有我
           已经就是自己选过的那个条目。"
           定性（**a · 计数与显示不一致 = 真 BUG**，不是"语义不同"）：
             · 计数那一侧 `filterCountsOf()` 是**纯 matchFilter**（chips 上的数字是准的）；
             · 显示这一侧多挂了一个 `keepVisible` ⇒ 列表比 chips 上的数字**长出一截**，
               多出来的那些行**不属于这个筛选**（同一屏里数字与内容自相矛盾）。
           `keepVisible` 的**设计意图**（见它自己的注释与 v3.8 用户原话）只服务一件事：
             "处理完不要消失" —— 也就是「待我处理」那一档里让定过的条目半透明留在原位；
           上面那一行已经用 `PM.needsChoice(it) && !!decOf(it).source` **精确地**表达了这件事
             （只留"需要你选、且你已经选过"的），**根本不需要 keepVisible 兜底**。
           ⇒ 去掉这一挂：其余各档一律**只看它自己那一类**（数字与列表回到同一个判据）。
           ★零回归面：① 「全部」matchFilter 恒真、② 「待我处理」走上面那一行、
             ③ 「空条目」只有它自己那一档才显示（matchFilter 也是恒真）⇒ 四档行为一个字没变；
             变的只有"不该出现在这一档里的行不再出现"。 */
        return matchFilter(it, S.filter, PM);
    }).sort((a, b) => {
        // ★排序稳定：优先"预设里的位置"；拿不到位置的按它在分析结果里的下标（否则全挤在同一个兜底值上，看起来"顺序完全乱"）
        const posOf = (it) => {
            if (S.posMap.has(it.key)) return S.posMap.get(it.key);
            if (it.next && it.next.orderIndex >= 0) return it.next.orderIndex + 0.9;
            if (it.mine && it.mine.orderIndex >= 0) return it.mine.orderIndex + 0.9;
            return 5e5 + (it.next ? it.next.index : (it.mine ? it.mine.index : an.items.indexOf(it)));
        };
        return cmpItemOrder(rankOf(a), posOf(a), rankOf(b), posOf(b));   // ★V③：override 优先（纯逻辑见下面那段）
    });
}

/* ==== ywpu-listorder-core:start（纯逻辑，别在这段里引用外面的东西 —— 探针会把这段单独抽出来跑）==== */
/** ★V③ 两条条目在「条目详细编辑」列表里的先后（**纯函数**：只吃两个数，不碰 DOM/状态）。
 *  · `rank` = 它在用户手调顺序（`S.orderOverride`）里的下标；不在里面 → -1
 *  · `pos`  = 它在预设里的位置（`buildPosMap` 出来的那把尺子）
 *  两把尺子**同一个刻度**（都是"在结果顺序里排第几"），所以 `rank + 0.5` 能与 `pos` 直接比 ——
 *  不在 override 里的条目（你标了"不要"的那些）就会继续插在它本来该在的地方，不会被甩到末尾。
 *  · 两个 rank 都是 -1（没手调过）→ **完全等于老口径**（只比 pos）；相等 → 返回 0（`sort` 稳定，不动它）。
 *  @returns {number} <0 = a 在前；>0 = b 在前；0 = 一样（保持原相对次序） */
function cmpItemOrder(aRank, aPos, bRank, bPos) {
    if (aRank >= 0 || bRank >= 0) {
        const va = aRank >= 0 ? aRank + 0.5 : aPos;
        const vb = bRank >= 0 ? bRank + 0.5 : bPos;
        if (va !== vb) return va - vb;
    }
    return aPos - bPos;
}
/* ==== ywpu-listorder-core:end ==== */

// ---------------------------------------------------------------- 条目列表

/** ★Wave G ①：这个包"条目一条都不用你选"吗？（**结构判定** —— 不随用户点过什么变化）
 *  口径：`PM.needsChoice` 一条都不为真（跟 ② 那颗按钮的判据、跟 `bulkDecisions` 的筛法是同一个）。
 *  为什么用"结构"而不是"pending = 0"：pending 会因为你**已经挑完了**变成 0，
 *  那时候把列表收起来 = 把你刚挑好的东西藏了（绝对不行）。 */
function itemsAllSameNow() {
    const an = S.analysis;
    if (!an || !(an.items || []).length) return false;
    return !an.items.some(it => PM.needsChoice(it));
}
/** ★Wave G ①：现在该把条目区收成一句话吗？
 *  · 只在"这个包改了正则"时收（= 作者实测报的那种包）；普通更新包、两边完全一样的包，一个字不变；
 *  · 用户点过「展开看全部 N 条」之后就不再收（`S.itemsShown`）。 */
function itemsCollapsed() {
    if (S.itemsShown) return false;
    if (!(S.regexItems || []).length) return false;
    return itemsAllSameNow();
}

function renderList() {
    const host = $el('#ywpu-list');
    if (!host) return;
    const body = $el('#ywpu-body');
    const keepTop = body ? body.scrollTop : 0;      // 重绘前记住滚动位置
    /* ★★W110-B（作者原话："这两个折叠条是永远不消失的 我可以随时点击这两个折叠条把它展开收起"）：
       条目侧那根条**两种状态都在**（收起态 = 这一摊只有它；展开态 = 它当列表头，下面直接就是行）。
       同一根条、同一句 `预设条目 N 条 · 需要你选 M 条`、同一个点击动作（`scopeToggle('items')` ⇒
       与顶部那颗「预设条目」开关**同一个状态键**，双向同步）。★W107 的口径照旧：条里只有一个 caret + 一句话。 */
    const itemBar = () => scopeBarHtml('items', ((S.analysis || {}).items || []).length, scopeNeedCount('items'), S.scopeItems !== false);
    if (S.scopeItems === false) {
        /* ★W103-丙/丁 的形态（收起 = 只露这一根条，不是白屏）；★W110-B 起这根条**在展开态也不撤**。 */
        host.innerHTML = itemBar();
        /* ★★W107-②a：这里原来把工具条 `display:none` 藏起来 —— **不再藏**：工具条常驻顶部（两种模式都在），
           而且每一键都作用到"当前显示的那一摊"（正则侧见 renderToolbar / renderRegexBox 的注释）。 */
        bindScopeBar(host, 'items');
        applyAutoInkAll();                          // ★R7：空态那几个字也要过一遍兜底
        return;
    }
    const tb = $el('#ywpu-toolbar'); if (tb) tb.style.display = '';   // ★W107-②a：工具条常驻（上面那条隐藏开关已删，这里照旧兜一道）
    /* ★Wave G ①（作者原话："前面一大片没改动的、要拖到很下面才看得到正则"）：
       条目 156 条一条都不用你选 → 列表先收成**一句话**（不是删掉：点一下就能看全部）。
       这样"正则块"（挂在列表下面）从第 8 屏提到首屏 —— 一进来就能看见唯一要处理的东西。 */
    if (itemsCollapsed()) {
        const an = S.analysis;
        const n = an.items.length;
        const rxNeed = (S.regexItems || []).filter(it => PM.regexNeedsChoice(it)).length;
        host.innerHTML = itemBar() + `<div class="ywpu-empty ywpu-allsame">
            <span class="ywpu-note">这个包一条条目都没改：<b>${n}</b> 条都是「两边一样」，不需要你逐条看${rxNeed ? '；要你挑的在下面的「正则」那块里' : ''}。</span>
            <button class="ywpu-btn ywpu-mini" id="ywpu-show-items" title="只是先收起来（内容一条都没删）：点一下就铺开全部 ${n} 条，跟以前一模一样">▸ 展开看全部 ${n} 条</button>
        </div>`;
        bindScopeBar(host, 'items');
        host.querySelector('#ywpu-show-items')?.addEventListener('click', () => {
            S.itemsShown = true;
            renderList();
            renderFoot();
        });
        applyAutoInkAll();                          // ★R7：空态那几个字也要过一遍兜底
        return;
    }
    const items = visibleItems();
    if (!items.length) {
        host.innerHTML = itemBar() + `<div class="ywpu-empty">${S.filter === 'decide' ? '没有需要你处理的条目 —— 直接点右下角「生成新预设」就行' : '没有匹配的条目'}</div>`;
        bindScopeBar(host, 'items');
        applyAutoInkAll();                          // ★R7：空态那几个字也要过一遍兜底
        return;
    }
    /* ★★W110-B：条当**列表头**（展开态也在）—— 下面直接就是行。 */
    host.innerHTML = itemBar() + items.map(it => itemHtml(it)).join('');
    bindScopeBar(host, 'items');
    bindList();
    if (body) body.scrollTop = keepTop;             // 恢复（修"点一下跳回最上面"）
    applyAutoInkAll();                              // ★R7：列表重绘后过一遍"自动取色 + 对比兜底"
}

/** 开关的直观标记：On → Off */
function swPill(on) { return `<span class="ywpu-sw ${on ? 'ywpu-sw-on' : 'ywpu-sw-off'}">${on ? 'On' : 'Off'}</span>`; }

/** 每条目的差异块缓存（同一条重绘时不重复算 LCS） */
function blocksOf(it) {
    if (!S.blocks) S.blocks = {};
    const key = it.key + '|' + (it.mine ? it.mine.text.length : 0) + '|' + (it.next ? it.next.text.length : 0);
    if (!S.blocks[key]) S.blocks[key] = PM.diffBlocks(it.mine.text, it.next.text);
    return S.blocks[key];
}

/** 这一处"用户定过没有"（刚点开时谁都不该盖章） */
/** 这一处"定过没有"：整条定了 → 全定；否则看 blockDecision
 *  ★v3.9：用户点掉的勾存成 **null**（不是删掉 key）—— 删了 key 就分不清"没点过"和"点掉了"，
 *    会出现"取消第 2 处、第 1 处又自己打上勾"（用户实测 BUG） */
function blockDecided(dec, bl) {
    if (dec.source === 'mine' || dec.source === 'next' || dec.source === 'both') return true;   // 整条都定了
    const v = (dec.blockDecision || {})[bl.i];
    return v === 'mine' || v === 'next' || v === 'both';
}

/** 某一处"跟谁"：默认跟新版；用户点过的存在 blockDecision 里（null = 用户点掉了这一处的勾 → 显示上按整条方向） */
function blockSideOf(dec, bl) {
    if (dec.source === 'mine') return 'mine';
    const v = (dec.blockDecision || {})[bl.i];
    return v === 'mine' ? 'mine' : 'next';
}

/** 这一条整体现在选的是哪一版（段控件亮灭 / 提示文字都用它）
 *  ★v4.0 用户定的规则（修 BUG 二）：按钮**只在"每一处都点过、而且都点的是它"时才点亮**；
 *    只点了一部分 / 有一处被取消 → 按钮变暗（= 它现在只是"帮我全勾一遍"的工具，不代表结果）。
 *    点暗的按钮 = 把所有处都勾成它；点亮时再点 = 全部取消（**不是取反**：取消一处后按钮已变暗，
 *    再点它是"重新全勾"，不会把整条清空 —— 这正是用户怕的那个 BUG）。 */
function choiceOf(it, dec) {
    const src = dec.source || null;
    if (!(it.mine && it.next)) {
        return { kind: src === 'mine' ? 'mine' : src === 'next' ? 'next' : 'none', mineOn: src === 'mine', nextOn: src === 'next', bothOn: false };
    }
    const changes = blocksOf(it).filter(b => b.changed);
    const picks = (v) => v === 'mine' || v === 'next' || v === 'both';
    const bd = dec.blockDecision || {};
    const sides = changes.map(b => bd[b.i]).filter(picks);            // 只算"点过"的处（null/undefined 不算）
    const allPicked = changes.length > 0 && sides.length === changes.length;
    const only = (v) => allPicked && sides.every(s => s === v);
    if (!changes.length) {
        return { kind: src || 'none', mineOn: src === 'mine', nextOn: src === 'next', bothOn: src === 'both' };
    }
    // 整条定了（= 每一处都跟着这一版）→ 对应按钮点亮
    if (src === 'mine') return { kind: 'mine', mineOn: true, nextOn: false, bothOn: false };
    if (src === 'next') return { kind: 'next', mineOn: false, nextOn: true, bothOn: false };
    if (src === 'both') return { kind: 'both', mineOn: false, nextOn: false, bothOn: true };
    if (src === 'custom') {
        if (allPicked && only('mine')) return { kind: 'mine', mineOn: true, nextOn: false, bothOn: false };
        if (allPicked && only('next')) return { kind: 'next', mineOn: false, nextOn: true, bothOn: false };
        return { kind: 'mix', mineOn: false, nextOn: false, bothOn: false, partial: true, picked: sides.length };
    }
    return { kind: 'none', mineOn: false, nextOn: false, bothOn: false };
}

/** 这一条里"还剩几处没点过"（点了的才算挑过，没点过的默认跟新版） */
/** 这一条里"还剩几处没点过"（点了的才算挑过，没点过的默认跟新版）
 *  ★W100-乙（作者原话："X处都点过了 这个怎么**不包括名字和开关的变化**啊？"）：
 *  名字 / 开关与内容**并列**（内核 `itemDecided()` 同源）—— 这个计数也把它们算进去：
 *   · 内容那一维只在"真有内容可挑"时才算（判据与内核 `contentDim` 同源：单边条目 / 没改名 → 算；
 *     只改名的条目 → 看正文 diff 与指纹差）；
 *   · 名字（`renamed`）/ 开关（`enabledDiff`）各算 1 处，亲手选过才算（与内核两道闸同源）。 */
function decideProgress(it, dec) {
    /* ★W101 防御（一条真炸过的路）：这个函数走 `blocksOf()`，而 `blocksOf()` 读 `it.mine.text` /
       `it.next.text` —— **单边条目有一边是 null**。W101 第一版把它提到 `renderEffect()` 最前面
       无条件算 ⇒ 展开"只有我有 / 新版新增"那两种条目时 `Cannot read properties of null (reading 'text')`
       （`run-updater-e2e` 抓到、点「生成」那条路也一起炸；已改回"只在两边都有时才算"）。
       这里再兜一道：单边/空条目 ⇒ 0 处（调用方拿到的是一份"没什么可挑"的读数，永远不会是异常）。 */
    if (!it || !it.mine || !it.next) return { total: 0, decided: 0, left: 0 };
    const changes = blocksOf(it).filter(b => b.changed);
    const bd = dec.blockDecision || {};
    const whole = dec.source === 'mine' || dec.source === 'next' || dec.source === 'both';
    const picked = (v) => v === 'mine' || v === 'next' || v === 'both';
    const contentDecided = whole ? changes.length : changes.filter(b => picked(bd[b.i])).length;
    const paired = !!(it && it.mine && it.next);
    const textDiff = !!(it && it.diff && (it.diff.add || it.diff.del));
    const switchOnly = paired && it.status === PM.STATUS.SAME && !!it.enabledDiff;
    const needContent = paired ? (!switchOnly && (it.renamed ? (textDiff || !!it.mineChanged) : true)) : true;
    let total = 0, decided = 0;
    if (needContent) {
        if (changes.length) { total += changes.length; decided += contentDecided; }
        else { total += 1; decided += dec.source ? 1 : 0; }   // 正文行级 diff 为 0、差在条目属性（指纹）那一档
    }
    if (paired && it.renamed) { total += 1; decided += (dec.name === 'mine' || dec.name === 'next') ? 1 : 0; }
    if (paired && it.enabledDiff) { total += 1; decided += (dec.enabled === 'mine' || dec.enabled === 'next' || typeof dec.enabled === 'boolean') ? 1 : 0; }
    return { total, decided, left: Math.max(0, total - decided) };
}

/** 一句话说清"这一条最后会怎么进新预设" */
function resultNote(it, dec) {
    const src = dec.source;
    if (!it.mine || !it.next) {
        if (it.mine) return src === 'mine' ? '保留这一条（新版没有它）' : (src === 'next' ? '不要这一条' : '还没选');
        return src === 'next' ? '加进新预设' : (src === 'mine' ? '不要这一条' : '还没选');
    }
    if (!PM.needsChoice(it)) return '';        // 两边一样、不用管 → 不写结果（免得看着像'你选了用新版'）
    // 只有"开关不同"要处理（正文一字未动）→ 结果说明写开关
    if (!(it.diff && (it.diff.add || it.diff.del)) && !it.renamed) {
        if (dec.enabled === 'mine') return '新预设里这条' + (it.mine.enabled !== false ? '打开' : '关掉') + '（还原你的旧状态）';
        if (dec.enabled === 'next') return '新预设里这条' + (it.next.enabled !== false ? '打开' : '关掉') + '（跟新版）';
        return '还没选：保持新状态，还是还原旧状态';
    }
    if (!src) return '还没选';
    if (src === 'mine') return '整条用我的';
    if (src === 'next') return '整条用新版';
    if (src === 'both') return '保存为两版：新版照旧，你的版本另存一条（名字（旧版））跟在它后面';
    const pg = decideProgress(it, dec);
    if (pg.left) return `已挑 ${pg.decided}/${pg.total} 处`;
    const ch = choiceOf(it, dec);
    if (ch.kind === 'mine') return '每一处都挑了你的 → 等于整条用我的';
    if (ch.kind === 'next') return '每一处都挑了新版 → 等于整条用新版';
    return '按逐处挑的拼好';
}

/** ★★W110-C（作者 2026-10-07 凌晨原话）："有一些只有一行标题 然后那个里边的具体内容又比较短的情况下
 *  然后我点击这个条目 它展开来 **它是一个空展开**……然后它那个长度就会有点微妙的变化 一长一短一长一短
 *  怪怪 但实际上**没有更多的内容**"）+ 协调方口径："无可展开内容则不给可点开的外观（不可展开、点击无位移）"。
 *
 *  复现（真预设对 C6-用户自改V0811 × C6-作者新版V0923 · 未改动产品的逐行读数见报告 §C recon）：
 *  用户预设里有 **17~18 条"结构标记"条目**（`└──NSFW──┘` / `────────────` / `─还不行就再加上─` …）
 *  的**正文是空的**（`content` 长度 0）—— 它们两边一样 / 只有我有 / 新版新增时都会进列表，
 *  点开后的展开区 = 一句话的抬头（"原文（两边一样）" / "你这一条的完整内容…"）+ **一个空白的正文框**
 *  + 「← 回总览」——**一个字节的内容都没有**（截图 `w110-empty-mine-pc-open.png`）。
 *
 *  判据（保守、语义化 —— 只吃"这一条展开到底有没有东西可看"）：
 *   · 有差异（`it.diff.add|del`）⇒ 可展开（要给他挑红/绿那一栏）；
 *   · 有名字 / 开关两维要挑（`renamed` / `enabledDiff`）⇒ 可展开（展开区有上下两组可点选）；
 *   · 其余（两边一样 / 单边 / 字段差那几种）⇒ **看正文有没有实字**：`text.trim()` 为空 = 无可展开内容。
 *  ⇒ 这类行：不画展开三角、点行头**一个像素都不动**（不重绘、不换高）——"一长一短"的抖从此没有来源。
 *  ★界线（写清楚免得被当成漏杀）：**只杀"一个字都没有"的**——像 `# NSFW` 这种"一行短正文"照旧可展开
 *    （那是真内容，展开能看见它；要求是"没有更多的内容"⇒ 有内容就不算）。 */
function expandableItem(it) {
    if (!it) return false;
    if (it.mine && it.next) {
        if (it.renamed || it.enabledDiff) return true;                 // 名字 / 开关那两维要挑
        if (it.diff && (it.diff.add || it.diff.del)) return true;      // 有内容差异
        return String(it.mine.text || '').trim().length > 0;           // 两边一样：正文有实字才值得展开
    }
    return String(((it.mine || it.next || {}).text) || '').trim().length > 0;
}

function itemHtml(it) {
    const meta = statusMeta(it);
    const dec = decOf(it);
    const pending = isPending(it);
    /* ★★W110-C：先判"这一条点开到底有没有东西" —— 没有 ⇒ 展开态强制为假（不画三角、点击无位移）。 */
    const canExpand = expandableItem(it);
    const expanded = canExpand && !!S.expanded[it.key];
    const nm = it.next?.name || it.mine?.name || '(未命名)';
    const noNeed = !PM.needsChoice(it);
    const hasDiff = !!(it.diff && (it.diff.add || it.diff.del));
    const ch = choiceOf(it, dec);
    /* ★W101-甲①（作者 2026-10-06 原话："每个条目外面的 OFF→ON 或者 ON→OFF 清除掉 —— 毕竟前面改了开关
       已经显示了，而且点开具体变化也显示了"）：条目行里那对 `On → Off` 牌子**整颗删掉**
       （改前在这里 push 进 `metric` 的 `.ywpu-swdiff`）。开关那件事现在只说一遍 = 展开区
       「开关变化」那块（`dimChoiceHtml()` 里 en 那一块：旧版 OFF / 新版 ON 两组，**可直接点选**）。
       ★W101-甲④（他给的自上而下次序）：展开区次序**不再由这里定** —— 名字 / 开关两块搬进
       `renderEffect()` 统一排：① 用我的/保存为两版/用新版 → ② 还有 N 处没选 → ③ 名字变化 →
       ④ 开关变化 → ⑤ 内容变化（见 `renderEffect()` 顶部那段注释）。 */
    const metric = [];
    // v3.9 用户：条目后面那个 +N/−M（正负）没用，删掉。位置挪动的"第N位→第M位"留着（那是有用的信息）
    if (it.orderMoved) metric.push(`<span class="ywpu-metric ywpu-moved">第 ${it.mine?.orderIndex >= 0 ? it.mine.orderIndex + 1 : '?'} → 第 ${it.next?.orderIndex >= 0 ? it.next.orderIndex + 1 : '?'} 位</span>`);
    // v4.0：两份顺序表里都没有的条目已经由内核**直接剔除**（用户："那是 ST 里隐藏的条目，别管它"）→ 这里不用再标了

    // 选择：点文字（三颗互斥；亮着再点=全取消，暗着点=帮我全勾一遍）
    const seg = (act, label, on) => `<span class="ywpu-opt${on ? ' ywpu-on' : ''}" data-act="${act}">${label}</span>`;
    let acts = '';
    const sameContent = !hasDiff && !it.renamed;          // 正文一字未动
    /* ★W17C-2②（作者本批原话）："如果说把所有按钮都加进去的话…**但同时它也可以单独就是自己手选开关**"。
       背景（第一轮报告 §3③）：内核判"两边不同"看的是**指纹**（正文+角色+注入位置+注入深度），
       所以有一类条目**正文一字未动、差异只在"角色/注入位置/注入深度"上** ⇒ `hasDiff` 与 `it.renamed`
       都是假（第一支不画）、`enabledDiff` 也可能是假（第二支也不画）⇒ 这一行**一颗按钮都没有**
       （作者原话："我看了一下那些没有办法选择的那些条目"）。
       这里按作者原话补齐两件：① 内容那三颗（用我的 / 保存为两版 / 用新版）也给这类行；
       ② 用一句人话**说清差在哪**（不然用户看着两条正文一模一样却要他拍板 —— "看不出来为什么"）。
       ★`fieldDiff` 的判据 = "两边都有 + 内核要选 + 正文与名字都没动" —— 与内核 `entryFp()` 的口径同源
         （正文/角色/位置/深度），不自己另发明一套。 */
    const pureSwitch = !!it.enabledDiff && it.status === PM.STATUS.SAME;   // 只有开关不同（正文与属性都没动）
    const fieldDiff = !!(it.mine && it.next) && sameContent && PM.needsChoice(it) && !pureSwitch;
    const fieldDelta = (() => {                                  // 差异字段的"旧 → 新"人话（只用本地量，不开新顶层函数）
        if (!fieldDiff) return '';
        const L = [];
        const pair = (label, a, b) => { if (String(a ?? '') !== String(b ?? '')) L.push(label + ' ' + (a ?? '（无）') + ' → ' + (b ?? '（无）')); };
        pair('注入深度', it.mine.depth, it.next.depth);
        pair('注入位置', it.mine.pos, it.next.pos);
        pair('角色', it.mine.role, it.next.role);
        return L.join(' · ');
    })();
    if (it.next && it.mine) {
        /* ★§BY-G（2026-09-23 · 作者第十七批）：那句"新预设里这条现在是 X，你原来是 Y"原来**只在"纯开关不同"
           的行上给**；"既改了正文、又开关不同"的条目（展开区有红/绿底色）下面**没有口径**。
           作者原话："有些条目既开关不同、又两边正文不同，但下面没有那句补充说明" ⇒ 现在凡 enabledDiff 一律补。 */
        /* ★W101-甲①/甲④：W100-丁加的那句 `开关：旧版开 → 新版关`（`enHint`）**整句删掉** ——
           作者本轮把"开关这件事说两遍"当成毛病（行里那对 `On → Off` 就是他点名的第一处）。
           现在开关**只说一处**：展开区「开关变化」那块（`dimChoiceHtml()` 的 en 块，
           旧版 OFF / 新版 ON 上下两组、可直接点选），它在次序里紧跟在"还有 N 处没选"后面。 */
        /* ★★W99-甲（2026-10-06 · 作者原话）："那这个两边不同 **除了内容，前面还可以插入**：就是两边不同
           到底是**选择旧版开关、新版开关**，以及**选择旧版名字还是新版名字**……**要选完所有的**"。
           这一段的落点（三层，全在**同一份决策表**上，不是三套状态）：
             · **名字**（`it.renamed`）：行里给「用旧名字 / 用新名字」两颗，写 `dec.name`
               （展开区的 `.ywpu-patch.ywpu-k-dim` 那两组块写的是同一个键 —— 与正则侧同一套口径）；
             · **开关**（`it.enabledDiff`）：行里给「还原旧状态 / 保持新状态」两颗，写 `dec.enabled`；
             · **内容**（`hasDiff / fieldDiff`）：三颗（用我的 / 保存为两版 / 用新版），写 `dec.source`。
           三者的"必须选完"由内核 `itemDecided()` 一道判（选不全 = 仍算「待我处理」）。
           ★"只改了名字"的那种（正文一字未动、也没有字段差）**不再画内容三颗** —— 内容两边一样、
             "保存为两版"会存出两条同名同文的重复正则/条目（正则侧 W95 ④ 已经这么定过，这里与它对齐）。 */
        const nameBtns = it.renamed
            ? `<span class="ywpu-seg">${seg('opt-name-mine', '用旧名字', dec.name === 'mine')}${seg('opt-name-next', '用新名字', dec.name === 'next')}</span>`
            : '';
        const enBtns = it.enabledDiff
            ? `<span class="ywpu-seg">${seg('opt-en-mine', '还原旧状态', dec.enabled === 'mine')}${seg('opt-en-next', '保持新状态', dec.enabled === 'next')}</span>`
            : '';
        if (hasDiff || fieldDiff || (it.renamed && it.mineChanged)) {
            /* ★W99（自测抓到的真缺口）：条件里补上 `it.renamed && it.mineChanged` ——
               "改了名字、同时正文/角色/注入位置/深度也变了（但正文行级 diff 恰好为 0）"那种条目，
               名字那两颗之外**也得有内容这一维**（否则与内核 `itemDecided()` 的 `contentDim` 判据对不上：
               内核要 `source`、界面却不给按钮 ⇒ 这一条永远处理不完，W99 首跑 e2e 实测过）。
               `mineChanged` = 内核给的指纹差（`entryFp`：正文/角色/注入位置/注入深度），不是我猜的。 */
            /* ★§BY-F（2026-09-23 · 作者第十七批）：**统一"左旧右新"** ——
               左=用我的（旧）、中=保存为两版（两版都留，正文按新版走）、右=用新版。
               （这一组本来就是这个次序，本次只把"保存为两版"的定位写明、并补上 §BY-G 那句。）
               ★W17C-2②：条件里多了 `fieldDiff`（见上），这三颗对"字段差"那种行也生效。 */
            acts = `<span class="ywpu-seg">${seg('opt-mine', '用我的', ch.mineOn)}${seg('opt-keep-both', '保存为两版', ch.bothOn)}${seg('opt-next', '用新版', ch.nextOn)}</span>`;
            if (ch.kind === 'both') acts += '<span class="ywpu-opthint">两版都存下来，你以后再挑</span>';
            if (fieldDiff) acts += '<span class="ywpu-opthint" title="正文一字未动 —— 内核判它「两边不同」是因为这几个条目属性不同（它们决定这条在 ST 里怎么注入）">'
                + '⚙ 正文一字未动，差在：' + esc(fieldDelta || '条目属性') + '</span>';
            // （★W101-甲①：这里原来还有一句 `开关：旧版开 → 新版关` —— 整句删掉，见上面那段注释）
            // （"已挑 X/Y 处"不再写在这里 —— 上面徽标旁边已经写了「逐处挑 X/Y」）
        } else {
            // 没有"内容"这一维（正文一字未动）⇒ 行里直接给"名字 / 开关"这两维该有的选项
            acts = nameBtns + (nameBtns && enBtns ? ' ' : '') + enBtns;
        }
        // v3.9 用户："把两边一样放到那个（徽标）位置，下面就不用写了" → 第二行不再写"两边一样（不用管）"
    } else if (it.mine && !it.next) {
        /* ★§BY-F：新版删掉那对 —— 左=保留（我的还留着）、右=不要（= 丢弃，跟随新版删掉）。
           位置本来就对（作者确认过语义），本次**一个字节没动**，只把口径写在这儿。 */
        acts = `<span class="ywpu-seg">${seg('opt-keep', '保留', dec.source === 'mine')}${seg('opt-drop', '不要', dec.source === 'next')}</span><span class="ywpu-opthint">新版没有这条</span>`;
    } else if (it.next && !it.mine) {
        /* ★§BY-F：**左旧右新** —— 左=不要（不放进来）、右=加进来（跟新版走）。
           改前是"加进来"在左、"不要"在右（跟作者定的口径相反）；data-act 一个字没变，只换左右。 */
        acts = `<span class="ywpu-seg">${seg('opt-skip', '不要', dec.source === 'mine')}${seg('opt-add', '加进来', dec.source === 'next')}</span><span class="ywpu-opthint">新版新增的条目</span>`;
    }
    /* ★W101-甲③（作者 2026-10-06 原话："点开里面有一行 `改名：-剧场2(固定)【需开此头部】→一剧场2(常驻）一(别关我）`
       —— 这个地方也没必要了，因为里面不是有了上下对比的地方吗？"）：
       这枚 `.ywpu-rennote`（"改名：旧 → 新"）**整颗不再画** —— 名字的旧/新在展开区「名字变化」那块里
       上下两组**摆着给他点选**（`dimChoiceHtml()` 的 name 块），再写一行同样的字就是第二遍。 */
    // ★B13d：刚拖过这一条 → 操作行**最右边**给一颗「↩ 撤销拖动」（点了逐位回到拖动前的初始位置）
    const undoBtn = (S.dragUndo && String(S.dragUndo.ident) === String(mergedIdentOfItem(it)))
        ? `<button class="ywpu-btn ywpu-mini ywpu-undodrag" data-act="undo-drag" title="把顺序逐位回到你拖动之前的样子（拖动前是自动顺序就回自动顺序）">↩ 撤销拖动</button>`
        : '';

    // ★必须带上状态 class（ywpu-st-*）：否则左边条、名字颜色全落回默认色
    const cls = ['ywpu-item', meta.cls, pending ? 'ywpu-need' : 'ywpu-done', noNeed ? 'ywpu-noneed' : '', expanded ? 'ywpu-active' : ''].filter(Boolean).join(' ');
    /* ★W14 ④（作者第 23 批 · 真 BUG）：改前这里拿 `!pending` 当"两边一样"的判据 —— 但用户**做过决定之后**
       `pending` 也变成 false，于是「新版新增 / 只有我有」这两类（内核给它们 `diff = null` ⇒ `sameContent` 为真、
       `enabledDiff` 也为假）的徽标会**回落成「两边一样」**（作者原话："每个需要我处理的选项，只要点击进去，
       上面那个『新版新增/只有我有』就变成『两边一样』，这个不对吧？"）。
       现在判据换成**只给"本来就不用你管"的条目**（`noNeed` = 内核 `needsChoice` 为假 —— 这就是那三行的原意），
       而"做过决定"一律走绿色「我已选择」（判据 = 内核 `itemDecided`，与"待处理"计数、与"开关不同"那两颗按钮
       共用同一套判定 ⇒ 开关不同选完也进绿色态，不再是"开关不同"）。
       ★W14 ⑤：改前这里还跟着一颗 `pickPill()`（`.ywpu-pickpill` = 1px dashed 边框，作者说的"虚线框"）——
       下面那排 `用我的 ｜ 保存为两版 ｜ 用新版` 已经写着同一件事、选过的那颗也有底色 ⇒ **整颗删掉**（连同 CSS）。
       ★W14 ⑥：文案改「我已选择」，且**位置不变**（那一处位移是 `○→✓` 两个字宽不同造成的，修在 CSS 的 `.ywpu-mark`）。 */
    const sameRow = noNeed && sameContent && !it.enabledDiff;
    const decided = !noNeed && PM.itemDecided(it, dec);
    /* ★W100-丙：三个维度可以**同时**挂章（改了内容 / 改了名字 / 改了开关 各一枚）——
       复用现成的 `.ywpu-badge`（不新造样式）；`sameRow` 与「我已选择」两档一字未动。 */
    const badgeHtml = sameRow
        ? '<span class="ywpu-badge ywpu-st-same">两边一样</span>'
        : (decided
            ? '<span class="ywpu-badge ywpu-st-chosen" title="这一条你已经选过了；想改回来，展开后在下面重新点">我已选择</span>'
            : (meta.badges || [{ text: meta.badge, cls: meta.cls }]).map(b => `<span class="ywpu-badge ${b.cls}" title="${esc(meta.why)}">${b.text}</span>`).join(''));
    // ★§22：位置待定的新增条目——行里也标一个「位置待定」（跟总览页同一个说法），展开后能直接选位置
    const pend = pendingEntries().find(x => x.key && x.key === it.key) || null;
    const badgePend = pend ? '<span class="ywpu-of ywpu-of-pend" title="这条在你这份里找不到该插在哪（自动缝入位置没认出来）—— 展开它可以自己选插在哪一条后面">位置待定</span>' : '';
    return `
<div class="${cls}${pend ? ' ywpu-pendrow' : ''}" data-key="${esc(it.key)}" data-ident="${esc(mergedIdentOfItem(it))}">
    <div class="ywpu-item-head" title="${canExpand ? '点一下展开/收起；按住不动（长按）再上下拖 = 换它在结果里的位置' : '按住不动（长按）再上下拖 = 换它在结果里的位置（这一条没有可展开的内容）'}">
        <span class="ywpu-caret">${canExpand ? (expanded ? '▾' : '▸') : ''}</span>
        <span class="ywpu-mark" title="${pending ? '还没处理' : '处理过了'}">${pending ? '○' : '✓'}</span>
        ${badgeHtml}${badgePend}
        <span class="ywpu-item-name">${esc(nm)}</span>
        ${metric.join('')}
        <!-- ★B13（R6-e）：拖动「入口不再是这块」（M2：不展开、长按条目本体就能拖）—— 这里只留一个"能拖"的提示图形。
             ① 展开的这一条：画一枚 ywpu-dragh 的 ⠿（按住它、或按住这一条的任何地方，半秒就进拖动态）；
             ② 收起态：用 CSS 的伪元素 ::after 画同样的 ⠿（悬停才出现，不是 DOM 节点，不影响任何按元素个数取数的断言）。
             两种都不是唯一入口，所以不写"拖我换位置"那种字。
             ★★BJ-F-20（2026-09-21 作者反馈）：这两枚曾经**同时**出现在展开的那一条上（伪元素那条规则没排除展开态）
               ⇒ 作者看到"右上角有两个拖动按钮"。修法在 CSS 那一侧：伪元素收窄成 :not(.ywpu-active)（只在收起态出现），
               展开态只留这枚真节点（它有 title、cursor:grab、悬停变色）。**这一行一个字都不用改。** -->
        ${expanded ? '<span class="ywpu-dragh" title="按住这一条不动约半秒（长按）就能上下拖动换位置；拖完可以点「↩ 撤销拖动」退回">⠿</span>' : ''}
    </div>
    <div class="ywpu-acts">${acts}${undoBtn}</div>
    ${expanded ? renderEffect(it, dec) : ''}
    ${expanded ? posRowHtml(it) : ''}
</div>`;
}

// ---------------------------------------------------------------- 展开区：一栏正文 + 底色块

/** 正文行（原文，不加底色） */
function plainLines(text) {
    const arr = String(text ?? '').split('\n');
    if (!arr.length) return '<div class="ywpu-pl ywpu-pl-same">（空）</div>';
    return arr.map(t => `<div class="ywpu-pl ywpu-pl-same">${esc(t) || '　'}</div>`).join('');
}

/** 块里的行；两边都是一行且只改了少量字 → 把改掉的那几个字再刷一层同色深底 */
function patchLinesHtml(arr, side, bl, kind, cls, hint) {
    const other = side === 'mine' ? bl.next : bl.mine;
    let segs = null;
    // ★改动块：两边**整块拼成文本**做字级差异（内核会先掐掉公共前后缀，多长都能算）
    if (kind === 'chg') {
        try { const st = PM.inlineDiff(bl.mine.join('\n'), bl.next.join('\n')); if (st.some(x => x.type !== 'same')) segs = st; } catch (e) { segs = null; }
    }
    if (segs) {
        const drop = side === 'mine' ? 'add' : 'del';      // 另一边的变化字（本组不显示）
        // ★加深那一层按"增/删"上色：新增=绿底、删掉=红底（用户："明明是增加的绿色，怎么显示成黄色"）
        const html = segs.filter(x => x.type !== drop)
            .map(x => x.type === 'add' ? `<span class="ywpu-hl-add">${esc(x.text)}</span>`
                : x.type === 'del' ? `<span class="ywpu-hl-del">${esc(x.text)}</span>`
                    : esc(x.text)).join('');
        return `<div class="ywpu-pl ywpu-pl-grp">${html}</div>`;
    }
    const want = side === 'mine' ? 'del' : 'add';      // 这一组的变化字（要加深）
    const drop = side === 'mine' ? 'add' : 'del';      // 另一边的变化字 —— ★本组绝不能显示（显示了两边就长得一样）
    return arr.map((t, li) => {
        const body = (segs && li === 0)
            ? segs.filter(s => s.type !== drop).map(s => (s.type === want && s.text) ? `<span class="ywpu-hl">${esc(s.text)}</span>` : esc(s.text)).join('')
            : (esc(t) || '　');
        const chip = (li === arr.length - 1 && hint) ? `<span class="ywpu-alt-chip">${hint}</span>` : '';
        return `<div class="ywpu-pl ${cls || 'ywpu-pl-main'}">${body}${chip}</div>`;
    }).join('');
}

/** 一处不同 → 一个块，块里**上下两组都显示**（用户："我要看到旧的 也要看到新的"）：
 *   · 改动：[我的（旧）] 红底 + [新版] 绿底
 *   · 新增：[新版] 绿底 + 一行"不要这几行"
 *   · 删除：[我的（旧）] 红底 + 一行"跟新版删掉这几行"
 *  点哪一组 = 结果里用哪一组（选中的那组左边一条实线 + "✓ 结果用这版"）
 */
function patchHtml(bl, side, decided) {
    const kind = bl.mine.length === 0 ? 'add' : (bl.next.length === 0 ? 'del' : 'chg');
    const grp = (which, arr) => {
        const on = !!decided && side === which;      // ★没定过时两组都不盖章、都不变暗
        const lab = which === 'mine' ? '旧版' : '新版';
        let rows = patchLinesHtml(arr, which, bl, kind, 'ywpu-pl-grp');
        if (!arr.length) {
            rows = '<div class="ywpu-pl ywpu-pl-none">（' + (which === 'mine' ? '旧版这里什么也没有' : '新版把这几行删了') + '）</div>';
        }
        // ★选中的那组：右下角盖一个圆勾（图形，不用文字）；没选中的那组变暗
        const stamp = on ? '<span class="ywpu-stamp" title="结果里用这一版">✓</span>' : '';
        return `<div class="ywpu-grp ywpu-grp-${which}${on ? ' ywpu-on' : ''}" data-act="pick-side" data-block="${bl.i}" data-side="${which}" title="点这里 = 结果里用${lab}">`
            + `<span class="ywpu-grp-lab">${lab}</span><div class="ywpu-grp-rows">${rows}</div>${stamp}</div>`;
    };

    const tag = kind === 'add' ? '新版新增' : kind === 'del' ? '新版删掉' : '改了内容';
    // ★每一处都统一成"旧版 / 新版 两组"（纯增/纯删的另一边给占位），不再有单独的小字按钮
    const inner = grp('mine', bl.mine) + grp('next', bl.next);
    return `<div class="ywpu-patch ywpu-k-${kind}" data-block="${bl.i}" data-cur="${side}" data-decided="${decided ? 1 : 0}">
        <span class="ywpu-patch-tag">${tag}</span>
        <div class="ywpu-patch-body">${inner}</div>
    </div>`;
}
/** 没改动的行：短的直接显示，长的折起来 */
function sameRowsHtml(bl) {
    if (bl.lines.length <= 2) return bl.lines.map(t => `<div class="ywpu-pl ywpu-pl-same">${esc(t) || '　'}</div>`).join('');
    return `<details class="ywpu-fold ywpu-fold-same"><summary>没改动的 ${bl.lines.length} 行（点开看）</summary>`
        + bl.lines.map(t => `<div class="ywpu-pl ywpu-pl-same">${esc(t) || '　'}</div>`).join('')
        + '</details>';
}

/** 展开区最底下那一整行「← 回总览」（用户："放在所有东西的最底下、够大、一整行、每条都要有"） */
const backRow = () => '<div class="ywpu-backrow"><button class="ywpu-btn ywpu-backbtn" data-act="back-to-order">← 回总览（回到这一条）</button></div>';

/** 展开区：一栏正文 + 底色块（用户 2026-09-19 定：不要 diff 那个样子）
 *  · 黄底＝两边不一样（块里显示的是"现在跟的那一边"，点一下换边）
 *  · 绿底＝新版新增（点一下 = 不要）
 *  · 红底＝新版删掉（点一下 = 保留你的）
 *  · 灰掉的块＝这一处不要（点一下就能要回来） */
/** ★★W99-甲：条目展开区里**另外两个维度**（开关 / 名字）的选择块 ——
 *  作者原话："这个两边不同 **除了内容，前面还可以插入**：就是两边不同到底是**选择旧版开关、新版开关**，
 *  以及**选择旧版名字还是新版名字**，然后它的**格式就跟那个具体内容对比一样**，**让用户选择**一样，
 *  **要选完所有的**"。
 *  · 格式 = 与正文对比**同一套骨架**（`.ywpu-patch` + 上下两组 `.ywpu-grp-mine` 红底旧 / `.ywpu-grp-next` 绿底新，
 *    选中的那组盖章 `✓` + 变暗另一组 —— 一个类名都不新造）；
 *  · 位置 = 正文对比那块的**前面**（作者原话"前面还可以插入"）；
 *  · 交互 = 点哪一组用哪一组，**再点同一组 = 取消**（与正文那套、与正则那套逐字同一个口径）；
 *  · 只有真有不同的维度才画（`enabledDiff` / `renamed`）；两边都有才可能（单边条目没有"旧/新"两个值）。
 *  ★写的是**同一份决策表**（`dec.enabled` / `dec.name`）——与行里的快捷按钮、与内核 `itemDecided()` 三处同源。
 *  @param {object} it  内核条目产物
 *  @param {object} dec 这一条的决策（`S.decisions[key]`，可能为空对象）
 *  @returns {string} HTML（什么都不用选 → 空串） */
function dimChoiceHtml(it, dec) {
    if (!it || !it.mine || !it.next) return '';
    const grp = (dim, which, value) => {
        const on = (dim === 'name') ? (dec.name === which) : (dec.enabled === which);
        const lab = which === 'mine' ? '旧版' : '新版';
        return `<div class="ywpu-grp ywpu-grp-${which}${on ? ' ywpu-on' : ''}" data-act="dim-${dim}-${which}" title="点这里 = 结果里用${lab}（再点一次 = 取消）">`
            + `<span class="ywpu-grp-lab">${lab}</span><div class="ywpu-grp-rows"><div class="ywpu-pl ywpu-pl-grp">${esc(String(value))}</div></div>`
            + (on ? '<span class="ywpu-stamp" title="结果里用这一版">✓</span>' : '') + '</div>';
    };
    const out = [];
    /* ★W101-甲④：**名字在前、开关在后**（作者给的自上而下次序：…③ 名字变化 → ④ 开关变化 → ⑤ 内容变化）。
       改前这里是 en 在前、name 在后。 */
    if (it.renamed) {
        out.push('<div class="ywpu-patch ywpu-k-dim" data-dim="name" data-decided="' + ((dec.name === 'mine' || dec.name === 'next') ? 1 : 0) + '">'
            + '<span class="ywpu-patch-tag">名字</span><div class="ywpu-patch-body">'
            + grp('name', 'mine', it.mine.name || '（没名字）') + grp('name', 'next', it.next.name || '（没名字）')
            + '</div></div>');
    }
    if (it.enabledDiff) {
        /* ★W101-甲②（作者原话："展开里那句 `旧版 关（你原来是关的）/ 新版 开（新预设里是开的）`
           ⇒ 改成 `旧版 OFF` / `新版 ON`"）：两组的值**只写 ON / OFF**，括号里那半句解释去掉。
           组标签本来就是「旧版 / 新版」⇒ 连起来正好读成"旧版 OFF / 新版 ON"。 */
        const mv = it.mine.enabled !== false ? 'ON' : 'OFF';
        const nv = it.next.enabled !== false ? 'ON' : 'OFF';
        out.push('<div class="ywpu-patch ywpu-k-dim" data-dim="en" data-decided="' + ((dec.enabled === 'mine' || dec.enabled === 'next' || typeof dec.enabled === 'boolean') ? 1 : 0) + '">'
            + '<span class="ywpu-patch-tag">开关</span><div class="ywpu-patch-body">'
            + grp('en', 'mine', mv) + grp('en', 'next', nv)
            + '</div></div>');
    }
    return out.length ? '<div class="ywpu-dims">' + out.join('') + '</div>' : '';
}

function renderEffect(it, dec) {
    /* ★★W101-甲④（作者 2026-10-06 给的自上而下次序，逐条照做）：
        ① `用我的 保存为两版 用新版`   —— 行里那排（`itemHtml()` 的 `.ywpu-acts`），在本块**之前**
        ② `还有X处没选`                —— 下面这个 pickbar 里那颗 chip（★他把原文"没点过"改成"没选"）
        ③ 名字变化                     —— `dimChoiceHtml()` 的 name 块
        ④ 开关变化                     —— `dimChoiceHtml()` 的 en 块
        ⑤ 内容变化                     —— `.ywpu-doc` 里那几块（改前它排在 ② 后面、③④ 的前面）
       改前 ③④ 由 `itemHtml()` 画在**条目头下面、那排选项之前**（W100-乙-1 的位置）⇒ 本波搬回这里，
       与 ② ⑤ 排成他给的那一条竖线。
       ★W100-乙-1 的"放在最前面"仍然成立：③④ 依旧在**内容对比（⑤）之前**，只是现在排在 ①② 之后。
       ★W101-甲⑤（作者原话："删掉这一句：点有底色的地方 = 换成另一边"）：那枚 `.ywpu-note` 整颗删掉。 */
    const dims = dimChoiceHtml(it, dec);
    /* ② 那颗 chip 的 HTML —— 文案按作者本轮口径（"还有X处**没选**"；选完那档跟着说"都选过了"）。
       ★W101：`syncItemChips()` 里那两处就地刷新用的是**同一份文案**（三处一起改，别落下）。
       ★★写成一个**吃 pg 的函数**（不是先算好）：`decideProgress()` 里要走 `blocksOf()`，
         而 `blocksOf()` 读的是 `it.mine.text / it.next.text`（**单边条目有一边是 null**）——
         W101 第一版把它提到函数最前面无条件算 ⇒ 展开"只有我有 / 新版新增"的条目时
         `Cannot read properties of null (reading 'text')`（`run-updater-e2e` 当场抓到、生成路也炸）。
         所以这里回到"只在两边都有的时候才算"（与改前同一个调用点），单边那两支一个字节不碰它。 */
    const pickbar = (pg) => `<div class="ywpu-pickbar">
        <span class="ywpu-chip ${pg.left ? 'ywpu-c-decide' : 'ywpu-c-same'}">${pg.left ? `还有 <b>${pg.left}</b> 处没选` : `✓ ${pg.total} 处都选过了`}</span>
        ${whoPillHtml(it)}
        <span class="ywpu-flex"><button class="ywpu-btn ywpu-mini" data-act="pick-clear">撤销这一条的挑选</button></span>
    </div>`;
    // 只有一方有：直接摊开完整内容（用户自己删的 / 作者删的都能看到）
    if (!it.mine || !it.next) {
        const who = it.mine ? '你这一条的完整内容（新版里没有它）' : '新版这一条的完整内容（你这边没有它）';
        return `<div class="ywpu-effect">${dims}<div class="ywpu-doc"><div class="ywpu-doc-head">${who}</div>${plainLines((it.mine || it.next).text)}</div>${backRow()}</div>`;
    }
    const hasDiff = !!(it.diff && (it.diff.add || it.diff.del));
    if (!hasDiff) {
        return `<div class="ywpu-effect">${dims}<div class="ywpu-doc"><div class="ywpu-doc-head">原文（两边一样）</div>${plainLines(it.mine.text)}</div>${backRow()}</div>`;
    }
    const blocks = blocksOf(it);
    const pg = decideProgress(it, dec);
    const edited = dec.customEdited && typeof dec.customText === 'string';
    // 这一条最终会写成什么（预览框 + 手改都用它）
    // ★v3.9 修 BUG：整条选了"用我的"时，预览也必须按"我的"拼（以前固定按新版拼 → 选了跟没选一样，用户实测）
    const dflt = dec.source === 'mine' ? 'mine' : 'next';
    const cur = edited ? dec.customText : PM.assembleFromBlocks(blocks, dec.blockDecision || {}, dflt);
    let body;
    if (edited) {
        body = `<div class="ywpu-doc-head">这是你自己改过的文字（撤销见下面）</div>${plainLines(dec.customText)}`;
    } else if (dec.source === 'both') {
        body = `<div class="ywpu-doc-head">保存为两版：这一条照<b>新版</b>（下面这个预览就是），你的版本会另存成一条「${esc((it.mine && it.mine.name) || '条目')}（旧版）」紧跟它后面</div>`
            + `<div class="ywpu-patch ywpu-k-add"><span class="ywpu-patch-tag">新版（保留在原来的位置）</span><div class="ywpu-patch-body">${plainLines(it.next.text)}</div></div>`
            + `<div class="ywpu-patch ywpu-k-chg"><span class="ywpu-patch-tag">你的版本（另存一条）</span><div class="ywpu-patch-body">${plainLines(it.mine.text)}</div></div>`;
    } else {
        body = blocks.map(bl => bl.changed ? patchHtml(bl, blockSideOf(dec, bl), blockDecided(dec, bl)) : sameRowsHtml(bl)).join('');
    }
    return `<div class="ywpu-effect">
    ${pickbar(pg)}
    ${dims}
    <div class="ywpu-doc">${body}</div>
    <div class="ywpu-result">
        <div class="ywpu-doc-head">这一条将来会写成这样（可以直接改；点上面任何一块会回到自动拼的结果）</div>
        ${(cur || '').trim() ? '' : '<div class="ywpu-note ywpu-warn">⚠ 照现在这样挑，这一条会是<b>空的</b>（作者那版这条就是空的）—— 点上面那块把内容留下来</div>'}
        <textarea class="ywpu-textarea" data-custom="${esc(it.key)}" rows="6" spellcheck="false">${esc(edited ? dec.customText : cur)}</textarea>
    </div>
    <details class="ywpu-fold"><summary>看两版原文</summary>
        <div class="ywpu-doc-head">你的原文</div><div class="ywpu-doc-plain">${plainLines(it.mine.text)}</div>
        <div class="ywpu-doc-head">新版原文</div><div class="ywpu-doc-plain">${plainLines(it.next.text)}</div>
    </details>
    ${backRow()}
</div>`;
}

const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'));
const itemOf = (key) => S.analysis ? S.analysis.items.find(x => x.key === key) : null;
/** 这条在**结果**里的 identifier（新版骨架用 ② 的编号；只有我有 → 用我自己的）——§22 拖动/选位置都用它 */
const mergedIdentOfItem = (it) => String((it && it.next && it.next.identifier) || (it && it.mine && it.mine.identifier) || '');

/** 把"整条用某版"展开成逐处（点色块 = 在这个基础上改一处） */
/** 把"整条用某版"展开成**逐处的显式记录**，再叠上用户逐处的记录。
 *  ★v4.1 修 BUG（用户："我点用新版全勾了，再把第一处点成旧版，其它处的新版全被取消了"）：
 *    以前只处理 `source==='mine'`，`source==='next'` 时返回空表 → 点某一处后其它处**没有记录**，
 *    于是"盖过的章"全消失（看着像被取消）。现在 mine/next 都补齐每一处；'both' 按新版补齐
 *    （保存为两版 = 主条目跟着新版）。用户逐处的记录最后覆盖，保证"点过的不被冲掉"。 */
function expandForEdit(it, cur) {
    const bd = {};
    const changes = blocksOf(it).filter(b => b.changed);
    const whole = cur.source === 'mine' ? 'mine' : (cur.source === 'next' || cur.source === 'both') ? 'next' : null;
    if (whole) changes.forEach(b => { bd[b.i] = whole; });
    if (cur.blockDecision) Object.assign(bd, cur.blockDecision);
    return bd;
}

/** 逐处挑完的收尾：
 *  · 一处都没定 → 回到"还没选"（source=null）
 *  · **每一处都点过、而且都点同一版 → 收敛成"整条用我的/用新版"**（用户 v3.9："手动把每一处都选成旧版，
 *    上面还写着逐处挑好，应该写 用我的 / 用新版"）
 *  · 混着点 / 只点了一部分 → source='custom'（★绝不能把"点了一部分"当成整条定过，
 *    否则一刷新版就把没点过的处全盖章 —— 老 BUG 会回来） */
function applyBlockEdit(key, it, cur, bd) {
    const blocks = blocksOf(it);
    const changes = blocks.filter(b => b.changed);
    const picked = (v) => v === 'mine' || v === 'next' || v === 'both';
    const sides = changes.map(b => bd[b.i]).filter(picked);
    let source = null;
    if (sides.length) {
        const all = sides.length === changes.length;
        source = (all && sides.every(s => s === 'mine')) ? 'mine'
            : (all && sides.every(s => s === 'next')) ? 'next'
                : (all && sides.every(s => s === 'both')) ? 'both'
                    : 'custom';
    } else {
        S.decisions[key] = { ...cur, source: null, blockDecision: {}, customText: '', customEdited: false };
        S.keepVisible[key] = true;
        return;
    }
    const dflt = (source === 'mine' || source === 'both') ? 'mine' : 'next';
    S.decisions[key] = {
        ...cur, source, blockDecision: bd,
        customText: PM.assembleFromBlocks(blocks, bd, dflt),
        customEdited: false,
    };
    S.keepVisible[key] = true;
}

/** 点某一组：结果里就用那一版（显式选，不再靠"翻面"猜） */
function pickBlockSide(key, blockIndex, side) {
    const it = itemOf(key);
    if (!it || Number.isNaN(blockIndex)) return;
    const cur = S.decisions[key] || {};
    const bl = blocksOf(it).find(b => b.i === blockIndex);
    if (!bl) return;
    const changes = blocksOf(it).filter(b => b.changed);
    // ★先把"整条用某版"展开成逐处，再翻这一处（否则逐处状态和整条状态会打架）
    const bd = expandForEdit(it, cur);
    const want = side === 'mine' ? 'mine' : 'next';
    const already = blockDecided(cur, bl) && blockSideOf(cur, bl) === want;
    if (already) {
        // 再点同一组 = 取消这一处（勾消失）。
        // ★取消 = 存 **null**（不是 delete）：删了 key 下次展开时会被当成"没点过"重新按整条方向打勾。
        // ★v4.1：其它处的处理**全靠上面 expandForEdit**（整条用某版时它已经把每一处都补齐了）——
        //   这里只动这一处。以前在这里无条件给"没记录的处"补默认值 → 从"只点过几处"的状态取消一处时，
        //   会把**没点过的处**也一并盖章（矩阵测试抓到：每处点了又取消，回不到"没选"）。
        bd[blockIndex] = null;
    } else bd[blockIndex] = want;                // 点一下 = 定下这一处（盖章）
    applyBlockEdit(key, it, cur, bd);
}

/** 点一处：把这一处换成另一边（保留给拖动/兜底用） */
function pickBlock(key, blockIndex) {
    const it = itemOf(key);
    if (!it || Number.isNaN(blockIndex)) return;
    const cur = S.decisions[key] || {};
    const bl = blocksOf(it).find(b => b.i === blockIndex);
    if (!bl) return;
    const bd = expandForEdit(it, cur);
    bd[blockIndex] = blockSideOf({ source: cur.source, blockDecision: bd }, bl) === 'mine' ? 'next' : 'mine';
    applyBlockEdit(key, it, cur, bd);
}

/** 就地只改一个色块（拖动刷选时不能重绘整条 —— 重绘会把指针下的元素换掉，mouseover 就断了） */
function repaintPatchOnly(key, blockIndex) {
    const it = itemOf(key);
    if (!it) return;
    const dec = S.decisions[key] || {};
    const bl = blocksOf(it).find(b => b.i === blockIndex);
    if (!bl) return;
    const side = blockSideOf(dec, bl);
    document.querySelectorAll('.ywpu-item[data-key="' + cssEsc(key) + '"]').forEach(node => {
        const el = node.querySelector('.ywpu-patch[data-block="' + blockIndex + '"]');
        if (!el) return;
        if (el.getAttribute('data-cur') === side) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = patchHtml(bl, side, blockDecided(dec, bl));
        if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
    });
}

/** 就地刷一下"还剩几处 / 整条用我的·用新版"的亮灭（拖动过程中用） */
function syncItemChips(key) {
    const it = itemOf(key);
    if (!it) return;
    const dec = S.decisions[key] || {};
    const pg = decideProgress(it, dec);
    const ch = choiceOf(it, dec);
    document.querySelectorAll('.ywpu-item[data-key="' + cssEsc(key) + '"]').forEach(node => {
        const chip = node.querySelector('.ywpu-pickbar .ywpu-chip');
        if (chip) {
            /* ★W101-甲④：文案与 `renderEffect()` 那份**逐字同源**（作者把"没点过"改成"没选"）。 */
            chip.className = 'ywpu-chip ' + (pg.left ? 'ywpu-c-decide' : 'ywpu-c-same');
            chip.innerHTML = pg.left ? `还有 <b>${pg.left}</b> 处没选` : `✓ ${pg.total} 处都选过了`;
        }
        const m = node.querySelector('[data-act="opt-mine"]'), n = node.querySelector('[data-act="opt-next"]');
        if (m) m.classList.toggle('ywpu-on', ch.mineOn);
        if (n) n.classList.toggle('ywpu-on', ch.nextOn);
        // （v4.2：右边的"结果说明"文字已删；这里只刷选项的亮灭和进度）
    });
}

/** 顶部"还剩几条" + 底部统计（就地刷，不动列表 → 不跳） */
function syncCounters() {
    const pending = PM.pendingCount(S.analysis.items, S.decisions);
    document.querySelectorAll('#ywpu-summary .ywpu-chip').forEach(c => {
        if (c.textContent.includes('还剩') || c.textContent.includes('全部处理完')) {
            c.className = 'ywpu-chip ' + (pending ? 'ywpu-c-decide' : 'ywpu-c-same');
            c.innerHTML = pending ? `还剩 <b>${pending}</b> 条要处理` : '✓ 全部处理完了，可以生成';
        }
    });
    renderFoot();
}

/* ---------------- ★M1（R6-e）：重绘**不许让滚动/输入内容跳掉**（本项目的铁律） ----------------
 *  用户原话（第三批 M1）："勾选旧/新版时，下面「这一条将来会写成这样」会**自动跳回开头** → 位置不要轻易变动"。
 *  根因：点色块走 `commitItemEdit → repaintItem`，那条**整块重建**（新 textarea / 折叠块回到关闭、
 *  条目高度变了）→ 外层 `#ywpu-body` 的滚动位置就跟着漂。
 *  修法（通用、不挑触发路径）：重绘前把三样东西记下来，重绘后逐样还原：
 *    ① **外层滚动**：以"用户刚点的那个块"为锚点（它相对 #ywpu-body 的位置不变）——比死记 scrollTop 准，
 *       因为块的高度可能变（比如"看两版原文"折块被关掉）；
 *    ② **输入框自己的滚动**（`textarea[data-custom]` 那个"这一条将来会写成这样"框，用户可能滚到中间在看）；
 *    ③ **折块的开合状态**（`<details open>`；重绘会把它们全关掉 = 内容塌陷 = 看着像"跳回开头"）。
 *  锚点找不到（比如整列表重绘）就退回"记 scrollTop → 还原"。 */
function captureScrollState(anchorEl) {
    const st = { bodyTop: 0, key: '', block: '', top: 0, ta: [], folds: [] };
    const body = $el('#ywpu-body');
    if (!body) return st;
    st.bodyTop = body.scrollTop;
    try {
        const bodyBox = body.getBoundingClientRect();
        const node = anchorEl && anchorEl.closest ? anchorEl.closest('#ywpu-list .ywpu-item[data-key]') : null;
        const patch = anchorEl && anchorEl.closest ? anchorEl.closest('.ywpu-patch[data-block], .ywpu-result, .ywpu-effect') : null;
        const target = patch || node;
        if (target && bodyBox) {
            st.key = node ? (node.getAttribute('data-key') || '') : '';
            st.block = target.classList.contains('ywpu-patch') ? String(target.getAttribute('data-block') || '') : '';
            st.cls = target.classList.contains('ywpu-result') ? 'ywpu-result' : (target.classList.contains('ywpu-effect') ? 'ywpu-effect' : '');
            st.top = target.getBoundingClientRect().top - bodyBox.top;
            // 同一容器里同 key 的折块开合状态（按顺序记，重绘后按顺序还）
            if (node) st.folds = [...node.querySelectorAll('details')].map(d => !!d.open);
        }
        document.querySelectorAll('#ywpu-list textarea[data-custom]').forEach(t => st.ta.push([t.getAttribute('data-custom'), t.scrollTop]));
    } catch (e) { /* 记不下来就退回老行为（只还原 scrollTop），绝不让它把点击本身弄失败 */ }
    return st;
}
function restoreScrollState(st) {
    if (!st) return;
    const body = $el('#ywpu-body');
    if (!body) return;
    try {
        /* ★R9-i（P0 真回退 BUG）：**先把会改变布局高度的东西还原完，再量锚点、再钉滚动**。
           老顺序是"先钉滚动（2593）→ 再还原折块开合（2600）"，于是：
             · 量锚点位置时折块是**关着**的（新节点上 `<details>` 一律没有 open）；
             · scrollTop 被按"关着的高度"校正了一次（实测 -144px）；
             · 紧接着 `d.open = true` 把折块**重新撑开** → 锚点上面这段内容又长回去 144px
               ⇒ 屏幕上"我刚点的那一块"整块下移 144px、`scrollHeight` 前后都是 6641（内容总高没变）、
                 `scrollTop` 却已经少了 144（= r9-h 终评量到的那条纯回退）。
           折块开合 / 输入框内部滚动都**不影响** #ywpu-body 自己的 scrollTop，先还原它们不损失任何东西。 */
        // ① 折块开合还回去（不然会像"内容被折叠了、跳回开头"）
        if (st.key && Array.isArray(st.folds) && st.folds.length) {
            const node = document.querySelector('#ywpu-list .ywpu-item[data-key="' + cssEsc(st.key) + '"]');
            if (node) {
                const ds = [...node.querySelectorAll('details')];
                ds.forEach((d, i) => { if (i < st.folds.length) d.open = !!st.folds[i]; });
            }
        }
        // ② 输入框自己的滚动位置（也在量高度之前做完，免得它影响不到布局却留个"以后再补"的尾巴）
        for (const [k, top] of (st.ta || [])) {
            const t = document.querySelector('#ywpu-list textarea[data-custom="' + cssEsc(k) + '"]');
            if (t && top) t.scrollTop = top;
        }
        // ③ 最后才按锚点钉外层滚动（此刻布局已经是最终形态，量出来的差值才是真的）
        let hit = null;
        if (st.key) {
            document.querySelectorAll('#ywpu-list .ywpu-item[data-key="' + cssEsc(st.key) + '"]').forEach(node => {
                if (hit) return;
                if (st.block) {
                    const p = node.querySelector('.ywpu-patch[data-block="' + st.block + '"]');
                    if (p) { hit = p; return; }
                }
                if (st.cls) { const c = node.querySelector('.' + st.cls); if (c) { hit = c; return; } }
                hit = node;
            });
        }
        if (hit) {
            const bodyBox = body.getBoundingClientRect();
            body.scrollTop += (hit.getBoundingClientRect().top - bodyBox.top) - st.top;   // 把"正看着的块"钉回原处
        } else body.scrollTop = st.bodyTop;
    } catch (e) { /* 还原失败也不许影响功能 */ }
}

/** 一次点击后统一收尾（重绘这一条 + 计数 + 顺序页/弹窗）
 *  ★M1：anchorEl = "用户刚点的那个元素"（点色块就传那个块）—— 重绘后按它把滚动位置钉回原处。 */
function commitItemEdit(key, anchorEl) {
    repaintItem(key, anchorEl);
    syncCounters();
    renderOrderIfOpen();
    renderSheetIfOpen();
}

function bindList() { bindListEvents($el('#ywpu-list')); }

/** 拖动刷选：按下先"待命"，动了才算刷（不然手机上想滚动会误选） */
function paintStart(target, x, y) {
    const g = target.closest?.('.ywpu-grp[data-act="pick-side"]');
    if (!g) return;
    const p = g.closest('.ywpu-patch');
    const node = p && p.closest('.ywpu-item[data-key]');
    if (!p || !node) return;
    const bi = parseInt(p.getAttribute('data-block'), 10);
    if (Number.isNaN(bi)) return;
    // 第一个点的这一组决定刷成哪一边（点到我的就整片刷成用我的）
    PAINT.armed = { key: node.getAttribute('data-key'), bi, x, y, el: p, side: g.getAttribute('data-side') === 'mine' ? 'mine' : 'next' };
    PAINT.painting = null;
}
function paintMove(x, y) {
    if (!PAINT.armed) return;
    if (!PAINT.painting) {
        if (Math.abs(x - PAINT.armed.x) + Math.abs(y - PAINT.armed.y) < 6) return;
        const it = itemOf(PAINT.armed.key);
        if (!it) { PAINT.armed = null; return; }
        const bl = blocksOf(it).find(b => b.i === PAINT.armed.bi);
        if (!bl) { PAINT.armed = null; return; }
        const side = PAINT.armed.side;
        PAINT.painting = { key: PAINT.armed.key, side, last: -1 };
        paintOne(PAINT.armed.key, PAINT.armed.bi, side);
    }
}
/** 刷过一处：改状态 + 就地换这一个色块（不重绘整条） */
function paintOne(key, blockIndex, side) {
    const it = itemOf(key);
    if (!it) return;
    const bl = blocksOf(it).find(b => b.i === blockIndex);
    if (!bl) return;
    if (blockSideOf(S.decisions[key] || {}, bl) === side) return;
    const cur = S.decisions[key] || {};
    const bd = expandForEdit(it, cur);
    bd[blockIndex] = side;
    applyBlockEdit(key, it, cur, bd);
    repaintPatchOnly(key, blockIndex);
    syncItemChips(key);
}
function paintEnd() {
    const armed = PAINT.armed;
    PAINT.armed = null;
    if (PAINT.painting) {
        const k = PAINT.painting.key;
        PAINT.painting = null;
        PAINT.suppressClickUntil = Date.now() + 350;      // 这次 mouseup 后面的 click 别再切一次
        commitItemEdit(k);
        return;
    }
    if (!armed) return;
    // 只点了一下（没有拖动）→ 用这一组的版本（★以前这里是 pickBlock=翻面，
    //   于是"点旧版两次"会跳到新版 —— 用户实测的 BUG）
    const it = itemOf(armed.key);
    if (!it) return;
    PAINT.suppressClickUntil = Date.now() + 350;
    pickBlockSide(armed.key, armed.bi, armed.side === 'mine' ? 'mine' : 'next');
    commitItemEdit(armed.key, armed.el);                  // ★M1：以刚点的那个色块当滚动锚点
}
/** 页面滚动/换视图时取消"待命"，避免误当成点击 */
function paintCancel() { PAINT.armed = null; }

function bindListEvents(host) {
    if (!host) return;
    // ⚠ 赋值式绑定（不是 addEventListener）：容器只换 innerHTML，监听叠加会导致"点一下没反应"
    host.onclick = (e) => {
        const node = e.target.closest('.ywpu-item[data-key]');
        if (!node) return;
        const key = node.getAttribute('data-key');
        if (e.target.closest('summary, details')) return;     // ★折叠块（没改动的 N 行 / 看两版原文）让它自己开合
        // ★B13（R6-e）：刚刚长按/拖动过（`dragAteClick`）→ 这一个 click 什么都不做
        //   （长按是为了拖位置，不该顺手把条目展开/收起 —— 用户"点了没效果"的下一形态就是"点一下乱跳"）
        if (dragAteClick()) { e.preventDefault(); return; }
        const sideEl = e.target.closest('.ywpu-grp[data-act="pick-side"]');
        if (sideEl) {
            e.preventDefault();
            // 真鼠标点击已经由 mousedown/mouseup 处理过（那个更准：能区分"点"和"刷"），这里只兜底
            if (Date.now() < PAINT.suppressClickUntil || PAINT.armed || PAINT.painting) return;
            const bi = parseInt(sideEl.getAttribute('data-block'), 10);
            const sd = sideEl.getAttribute('data-side');
            if (Number.isNaN(bi)) return;
            pickBlockSide(key, bi, sd);
            commitItemEdit(key, sideEl);                      // ★M1：点色块 → 以这个色块当滚动锚点
            return;
        }
        if (e.target.closest('.ywpu-doc')) { e.preventDefault(); return; }
        const btn = e.target.closest('[data-act]');
        if (btn) { e.preventDefault(); return handleItemAction(key, btn.getAttribute('data-act')); }
        // 整张卡片都能点开/收起，但交互元素除外
        if (!e.target.closest('button, .ywpu-opt, .ywpu-seg, .ywpu-knobwrap, input, textarea, select, .ywpu-fold, summary, details, .ywpu-pickbar, .ywpu-doc-plain, .ywpu-posrow, .ywpu-pospick')) {
            e.preventDefault();
            return handleItemAction(key, 'toggle');
        }
    };
    host.onmousedown = (e) => {
        if (!e.target.closest('.ywpu-grp[data-act="pick-side"]')) return;
        paintStart(e.target, e.clientX, e.clientY);
        if (PAINT.armed) e.preventDefault();      // 别把文字选中
    };
    host.onmousemove = (e) => {
        paintMove(e.clientX, e.clientY);
        if (PAINT.painting) e.preventDefault();
    };
    host.onmouseover = (e) => {
        const p = PAINT.painting;
        if (!p) return;
        const el = e.target.closest?.('.ywpu-patch');
        if (!el) return;
        const node = el.closest('.ywpu-item[data-key]');
        if (!node || node.getAttribute('data-key') !== p.key) return;
        const bi = parseInt(el.getAttribute('data-block'), 10);
        if (Number.isNaN(bi) || bi === p.last) return;
        p.last = bi;
        paintOne(p.key, bi, p.side);
    };
    host.addEventListener?.('touchstart', (e) => {
        const t = e.touches && e.touches[0];
        if (!t || !e.target.closest('.ywpu-grp[data-act="pick-side"]')) return;
        paintStart(e.target, t.clientX, t.clientY);
    }, { passive: true });
    host.oninput = (e) => {
        const ta = e.target.closest('textarea[data-custom]');
        if (!ta) return;
        const key = ta.getAttribute('data-custom');
        const v = ta.value;
        S.decisions[key] = { ...(S.decisions[key] || {}), customText: v, customEdited: !!v };
        // v4.2：右边那行"结果说明"文字已经删掉了 → 这里只刷计数
        syncCounters();
    };
    // ★§22：条目编辑页里那条「插在哪一条后面」（位置待定的新增条目才有）+ 拖动手柄
    bindPosPick(host);
    bindItemDrag(host);
}

/** 最终正文（都用"逐处挑选"拼；整条用某版就走整条） */
function finalTextOf(it, dec) {
    if (it.mine && it.next) {
        if (dec.source === 'mine') return it.mine.text;
        if (dec.source === 'next') return it.next.text;
        if (dec.source === 'both') return PM.defaultSplice(it.mine.text, it.next.text, 'mineFirst');
        if (dec.customEdited && typeof dec.customText === 'string') return dec.customText;
        return PM.assembleFromBlocks(blocksOf(it), dec.blockDecision || {});
    }
    return (it.mine || it.next).text;
}

/** 就地重绘单条（保留滚动位置与展开状态）；找不到节点再退回整列表重绘
 *  ★M1：anchorEl 见 `commitItemEdit` 的说明 —— 传进来就把"正看着的块"钉回原位。 */
function repaintItem(key, anchorEl) {
    const it = itemOf(key);
    if (!it) { renderList(); return; }
    const nodes = document.querySelectorAll('.ywpu-item[data-key="' + cssEsc(key) + '"]');
    if (!nodes.length) { renderList(); return; }
    const sc = captureScrollState(anchorEl || nodes[0]);      // ★M1：重绘前记住滚动/折块/输入框内部位置
    const tmp = document.createElement('div');
    tmp.innerHTML = itemHtml(it);
    const tpl = tmp.firstElementChild;
    if (!tpl) return;
    nodes.forEach(node => node.replaceWith(tpl.cloneNode(true)));
    // 顶部计数（待处理 / 已处理完）
    syncCounters();
    restoreScrollState(sc);                                   // ★M1：还回去（铁律：任何重绘都不许跳滚动）
    /* ★W100-乙-4（作者原话："选了名字会让『内容里的划选字颜色』改变"）：条目一重绘，兜底层
       （`applyAutoInk`）先前写在这些元素上的**内联 color** 就跟着旧节点一起没了 ⇒ 内容区的
       `.ywpu-hl-add` 那层"划选字"文字色**当场变样**（真界面 recon4 读数：`rgb(44,44,43)` →
       `rgb(219,219,214)`；同一条里 4 处 `.ywpu-pl` 同变）。重绘完立刻把这个兜底过一遍 ——
       与 `renderList()` / `renderOrderView()` / `renderSheet()` 末尾**同一个入口、同一套口径**；
       兜底自带 key + `isConnected` 缓存：元素被换掉（isConnected=false）就必然重算，没换就是零开销。 */
    applyAutoInkAll();
}

/** 拖动刷选的全局状态（document 级监听只绑一次，避免越绑越多） */
const PAINT = { armed: null, painting: null, suppressClickUntil: 0 };
document.addEventListener('mouseup', () => paintEnd());
document.addEventListener('touchend', () => paintEnd());
document.addEventListener('touchcancel', () => { paintCancel(); PAINT.painting = null; });
window.addEventListener('scroll', () => paintCancel(), true);

function handleItemAction(key, act) {
    const it = itemOf(key);
    if (!it) return;
    const cur = S.decisions[key] || {};
    S.keepVisible[key] = true;
    if (act === 'toggle') {
        /* ★★W110-C：没有可展开内容的条目（正文空、也没差异/名字/开关要挑）⇒ **点了不动**：
           不改状态、不重绘 ⇒ 高度一个像素都不变（作者要的"不再空展开、长度不抖"就是这个）。 */
        if (!expandableItem(it)) return;
        const on = !S.expanded[key];
        S.curKey = key;                     // ★v4.0：手动展开/收起也记锚点（上一条/下一条 用它定位）
        if (on && getSettings().accordion !== false) S.expanded = {};   // 默认手风琴：开一条收其它
        if (on) S.expanded[key] = true; else delete S.expanded[key];
        renderList();
        return;
    }
    // —— 点文字选择（三颗互斥：用我的 / 保存为两版 / 用新版）——
    //   ★v4.0 语义（用户定）：按钮亮着 = 每一处都已经跟着它 → 再点一次 = 全部取消；
    //     按钮暗着（含"点了一部分/取消了一处"）= 点一下 = 把所有处都勾成它（**不是取反清空**）
    if (act === 'opt-mine' || act === 'opt-next' || act === 'opt-keep-both') {
        const which = act === 'opt-mine' ? 'mine' : act === 'opt-next' ? 'next' : 'both';
        const ch = choiceOf(it, cur);
        const on = which === 'mine' ? ch.mineOn : which === 'next' ? ch.nextOn : ch.bothOn;
        const source = on ? null : which;
        S.decisions[key] = { ...cur, source, blockDecision: {}, customText: '', customEdited: false };
        // ★v4.0 用户："单纯点这个按钮就别展开了，我需要看内容时自己点进去" → 不再自动展开
        commitItemEdit(key);
        return;
    }
    // 开关不同（正文一字未动）：保持新状态 / 还原旧状态 —— 选完这条就算处理完了（用户 v3.9）
    if (act === 'opt-en-next' || act === 'opt-en-mine') {
        const want = act === 'opt-en-mine' ? 'mine' : 'next';
        const nd = { ...cur };
        if (cur.enabled === want) delete nd.enabled; else nd.enabled = want;   // 再点一次 = 撤销
        S.decisions[key] = nd;
        commitItemEdit(key);
        return;
    }
    /* ★★W99-甲：**名字**那一维的两颗（行里的快捷按钮 + 展开区那两组块写的是同一个键 `dec.name`）——
       与内容/开关那几颗**逐字同一个口径**：点亮的再点 = 取消（`delete`），暗的点 = 选上。
       作者原话："它跟上面那个条目的点击逻辑一样…点进去选择、再点进去取消"。 */
    if (act === 'opt-name-mine' || act === 'opt-name-next') {
        const want = act === 'opt-name-mine' ? 'mine' : 'next';
        const nd = { ...cur };
        if (cur.name === want) delete nd.name; else nd.name = want;   // 再点一次 = 撤销
        S.decisions[key] = nd;
        commitItemEdit(key);
        return;
    }
    // ★W99-甲：展开区那两组块（`dimChoiceHtml()` 产出的 `data-act="dim-<维>-<边>"`）—— 与上面两组同一口径
    if (act === 'dim-en-mine' || act === 'dim-en-next' || act === 'dim-name-mine' || act === 'dim-name-next') {
        const isName = act.indexOf('dim-name-') === 0;
        const want = /-(mine|next)$/.exec(act)[1];
        const nd = { ...cur };
        const k = isName ? 'name' : 'enabled';
        if (nd[k] === want) delete nd[k]; else nd[k] = want;          // 再点同一组 = 取消
        S.decisions[key] = nd;
        commitItemEdit(key);
        return;
    }
    if (act === 'opt-en-toggle') {          // 拨钮：在"跟新版 / 跟我的"之间切换
        const cur2 = cur.enabled === 'mine' ? 'mine' : 'next';
        const only = !(it.diff && (it.diff.add || it.diff.del));
        const next2 = cur2 === 'mine' ? 'next' : 'mine';
        S.decisions[key] = { ...cur, enabled: next2, ...(only ? { source: next2 === 'mine' ? 'mine' : 'next' } : {}) };
        commitItemEdit(key);
        return;
    }
    if (act === 'opt-keep' || act === 'opt-drop') {
        const v = act === 'opt-keep' ? 'mine' : 'next';
        S.decisions[key] = { ...cur, source: cur.source === v ? null : v };
        commitItemEdit(key);
        return;
    }
    if (act === 'opt-add' || act === 'opt-skip') {
        const v = act === 'opt-add' ? 'next' : 'mine';
        S.decisions[key] = { ...cur, source: cur.source === v ? null : v };
        commitItemEdit(key);
        return;
    }
    if (act === 'pick-clear') {
        /* ★W99-甲："撤销这一条的挑选" = **三个维度一起回到"没选"**（内容 / 开关 / 名字 ——
           内核 `itemDecided()` 就是这么判的；只清内容会留下"开关/名字还选着"的半截态）。 */
        const { name: _n, enabled: _e, ...rest } = cur;
        S.decisions[key] = { ...rest, source: null, blockDecision: {}, customText: '', customEdited: false };
        commitItemEdit(key);
        return;
    }
    // ★B13d：撤销拖动（顺序逐位回到拖动前的初始位置）
    if (act === 'undo-drag') { undoDrag(); return; }
    if (act === 'back-to-order') { backToOrder(key); return; }
    if (act === 'copy-entry') {
        const ex2 = copyEntryOf(it, cur);
        extras().push(ex2);
        toast('success', '复制好了：' + ex2.name + '（到「新预设总览」里能看到、可拖动换位置）');
        return;
    }
    if (act === 'unpair') {
        if (!S.unpair.includes(key)) S.unpair.push(key);
        runAnalyze(true);
        toast('info', '已按"两条不同的条目"重新对比');
        return;
    }
}

/** 顺序页开着时，决策变了要顺手刷新 */
function renderOrderIfOpen() { if (S.view === 'order') renderOrderView(); }

/** 总览页那一行"开关现在是什么状态"（用户明确开/关优先，其次看新版/我的） */
function enabledOf(it, d) {
    if (typeof d.enabled === 'boolean') return d.enabled;
    if (d.enabled === 'mine' && it.mine) return it.mine.enabled !== false;
    if (it.next) return it.next.enabled !== false;
    return it.mine ? it.mine.enabled !== false : true;
}

/** 把一条现成条目复制成"要缝进去的新条目"（★把 ST 的原字段一起带过来，别只搬名字和正文） */
function copyEntryOf(it, dec) {
    const src = (it.next ? it.next.prompt : (it.mine ? it.mine.prompt : null)) || {};
    const nm = (it.next?.name || it.mine?.name || '条目') + '（副本）';
    return {
        id: newExtraId(), name: nm, content: finalTextOf(it, dec),
        afterIdent: it.next ? String(it.next.identifier) : (it.mine ? String(it.mine.identifier) : null),
        role: src.role, system_prompt: src.system_prompt !== false,
        injection_position: src.injection_position, injection_depth: src.injection_depth,
        injection_order: src.injection_order,
        injection_trigger: Array.isArray(src.injection_trigger) ? src.injection_trigger.slice() : [],
        forbid_overrides: !!src.forbid_overrides,
    };
}

/** 用户自己新建/复制的条目（"缝预设"） */
function extras() { if (!Array.isArray(S.extraEntries)) S.extraEntries = []; return S.extraEntries; }
function newExtraId() { return 'ywpu-new-' + Math.random().toString(36).slice(2, 10); }

/** 总览页行里的决策标记（用户："编辑完了这里要把待处理变成已处理"；一样的写"无需做处理"）
 *  ★W19A ③（作者第 24 批）：**文案缩短成 5 个字**的一颗绿框 —— 去掉"已处理 · "这个前缀与多余的字：
 *    「保存为新版」「保存为旧版」「保存为两版」「开关跟新版」「开关跟旧版」，
 *    以及「无需处理」→「**无需做处理**」（作者原话逐字给的这 6 个）。
 *  ★W19A ③b（2026-09-25 · 作者第 25 批 + 第 26 批**回话定案**）：三处逐字改，都按作者说的来：
 *    ① `开关更新版` → **`开关跟新版`**；② `逐处挑选`（4 字）→ **`已逐处挑选`**（5 字）；
 *    ③ `开关更旧版` → **`开关跟旧版`** —— ★这一处是主 Agent 问过作者之后的**回话确认成对**
 *      （作者原话："⒝ 肯定要啊 原本根本不通顺啊"），所以现在两颗开关档**成对**：
 *      「开关跟新版」/「开关跟旧版」（都是"跟哪边"的说法，不再一半"更新"一半"跟"）。
 *    ⇒ 旧字面 `开关更新版` / `逐处挑选` / `开关更旧版` 在产品代码里**一个都不许再出现**
 *      （`e2e/w19a-labels-check.js` 逐条钉住，含"0 命中"那条）。
 *  语义一个都没改：判据仍是内核 `needsChoice` / `itemDecided` 与同一张决策表（`cls` 也没动，
 *  颜色/悬浮说明跟着走）；改的只是**框里那几个字**。 */
function rowMark(it) {
    if (!it) return { t: '', cls: '' };
    if (!PM.needsChoice(it)) return { t: '无需做处理', cls: 'ywpu-m-same' };
    const d = S.decisions[it.key] || {};
    // ★v3.9：开关不同的条目点过 保持新状态/还原旧状态 也算处理完（内核 itemDecided 统一判定）
    if (!PM.itemDecided(it, d)) {
        if (d.source === 'custom') { const pg = decideProgress(it, d); if (pg.left) return { t: `挑到一半（还差 ${pg.left} 处）`, cls: 'ywpu-m-pend' }; }
        return { t: '点我处理', cls: 'ywpu-m-pend' };
    }
    // ★W19A ③：这两颗是"只动了开关"（正文一字未动）—— 说清是**跟哪边**
    // ★W19A ③b：两颗都按作者逐字改完并**成对**：「开关跟新版」/「开关跟旧版」
    //   （第 26 批回话："⒝ 肯定要啊 原本根本不通顺啊"）。旧字面「开关更新版」/「开关更旧版」一律不许再出现。
    if (!d.source && d.enabled) return { t: d.enabled === 'mine' ? '开关跟旧版' : '开关跟新版', cls: 'ywpu-m-ok' };
    if (d.source === 'custom') return { t: '已逐处挑选', cls: 'ywpu-m-ok' };
    if (d.source === 'mine') return { t: '保存为旧版', cls: 'ywpu-m-ok' };
    if (d.source === 'both') return { t: '保存为两版', cls: 'ywpu-m-ok' };
    return { t: '保存为新版', cls: 'ywpu-m-ok' };
}

/** 批量条的就地重画器（renderOrderView 里设置；勾选框变化时由 syncSelUi 调用） */
let batchBarRenderer = null;

/** 勾/取消一条（就地，不重绘 → 不跳） */
function setRowSel(ident, want, skipBar) {
    const set = new Set(S.selIdents || []);
    if (want) set.add(ident); else set.delete(ident);
    S.selIdents = [...set];
    const row = document.querySelector('#ywpu-view-order .ywpu-orow[data-ident="' + cssEsc(ident) + '"]');
    if (row) {
        row.classList.toggle('ywpu-selrow', !!want);
        const cb = row.querySelector('.ywpu-ocheck'); if (cb) cb.checked = !!want;
    }
    if (!skipBar && batchBarRenderer) batchBarRenderer();
}

/** 点条目 = 选中/取消 */
function toggleRowSel(ident) {
    setRowSel(ident, !(S.selIdents || []).includes(ident));
    S.lastSel = ident;                 // 新建条目会插在这一条后面
}

/** 从条目编辑页回到总览，并滚到这一条 */
function backToOrder(key) {
    const it = itemOf(key);
    const ident = it ? String((it.next && it.next.identifier) || (it.mine && it.mine.identifier) || '') : '';
    S.view = 'order';
    renderView();
    if (!ident) return;
    setTimeout(() => {
        const row = document.querySelector('#ywpu-view-order .ywpu-orow[data-ident="' + cssEsc(ident) + '"]');
        if (!row) return;
        row.scrollIntoView({ block: 'start' });     // ★回到总览时定位到这一条的最上面
        row.classList.add('ywpu-flash');
        setTimeout(() => row.classList.remove('ywpu-flash'), 1200);
    }, 80);
}

/** 多选状态就地刷新（勾/取消/批量后调用，不重绘列表） */
function syncSelUi() {
    const set = new Set(S.selIdents || []);
    document.querySelectorAll('#ywpu-view-order .ywpu-orow').forEach(r => r.classList.toggle('ywpu-selrow', set.has(r.getAttribute('data-ident'))));
    document.querySelectorAll('#ywpu-view-order .ywpu-ocheck').forEach(cb => { const r = cb.closest('.ywpu-orow'); if (r) cb.checked = set.has(r.getAttribute('data-ident')); });
    if (batchBarRenderer) batchBarRenderer();      // ★批量条要跟着出现/消失（用户勾了就要看到"已选 N 条"）
}

/** 总览页：单列全量 + 每行开关 + 点行去编辑 + 多选批量 + 新建/复制条目 */
function renderOrderView() {
    const host = $el('#ywpu-view-order');
    if (!host) return;
    const an = S.analysis;
    if (!an) { host.innerHTML = ''; return; }
    const od = an.order, c = od.counts;
    const pending = PM.pendingCount(an.items, S.decisions);
    const changed = c.moved + c.added + c.removed;
    const ex = extras();
    const sel = S.selIdents || [];

    // ★§22：顺序**只算一份**（orderRowsNow：内核顺序 → 位置待定提到最前 → 套上用户手动顺序）。
    //   写盘（doGenerate / stitchIntoCurrent）拿的是同一个函数的 ids，所以"看到的顺序 = 写盘的顺序"。
    const { auto: autoOrder, rows: orderList, pinned } = orderRowsNow();
    const pendingBy = new Map(pendingEntries().map(x => [x.ident, x]));
    /* ★S2-3（UI P9）：`从第 N 位挪来` 的参照系。
       原来拿的是**纯内核顺序**（autoOrder）—— 只要有 1 条「位置待定」被提到最上面，
       后面**所有**行的位次都会跟着 +1，于是 154 行里 150 行都印一句"从第 N 位挪来"（其实等于行号，纯噪声）。
       现在拿的是「**自动顺序**（含位置待定置顶）」= 用户自己没动手时的那个次序：
       只有**用户亲手拖过 / 手动指定过位置**的行才会显示这一列（其余整列省略）。 */
    const autoPos = new Map(orderList.map((r, i) => [r.identifier, i + 1]));
    const basePos = new Map((() => {
        // 自动顺序 = 内核顺序 + 位置待定置顶（与 orderRowsNow 里 pinned 那一步同一个口径，但不套用户的 S.orderOverride）
        const ids = autoOrder.map(r => r.identifier);
        const hit = new Set(ids.filter(id => pinned.has(id)));
        const ordered = hit.size ? pinFirst(ids, hit) : ids;
        return ordered.map((id, i) => [id, i + 1]);
    })());
    const extraById = new Map(ex.map(e => [String(e.id), e]));

    const keyByIdent = new Map();
    for (const it of an.items) {
        if (it.next) keyByIdent.set(String(it.next.identifier), it.key);
        if (it.mine) keyByIdent.set(String(it.mine.identifier), it.key);
    }
    const itOf = (ident) => { const k = keyByIdent.get(String(ident)); return k ? an.items.find(x => x.key === k) : null; };
    const movedNo = new Map();
    od.moved.forEach((m, i) => { movedNo.set(String(m.nextId), i + 1); movedNo.set(String(m.mineId), i + 1); });

    /* ★Wave W9-5（2026-09-24 · W9 查问题兵静态核查）：**「筛选有变化的」× 「全选」的合谋**
       改前：`全选` 拿的是 `orderList`（**全量行**）⇒ 筛选打开时它会把屏幕上看**不见**的行也勾进来，
       而底部那句只写「已选 N 条」⇒ 后面点「用我的 / 用新版 / 复制 / 开 / 关」会作用到用户根本看不见的条目上。
       改法（W9 给的第一个选项：**计数与批量都跟随筛选** = 用户看见什么就选什么）：
         · 这里把"**这一行真的画出来了**"的 identifier 记成 `S.orderVisibleIds`（判据还是**原来那一行**，
           一个字都没改、也没抄第二份 —— 只是通过筛选之后顺手记一笔）；
         · `全选` / 「已是全选吗」的判据 / 计数里的"看不见的那几条" 全读这一份（见 `batchAction` 与 `batchBarRenderer`）。
       ★不影响任何别的行为：行渲染、拖动、手动勾选、`clear` 全部走原来的路；`orderList` 本身一个字没动。 */
    const visIds = [];
    const rowsHtml = orderList.map((r, i) => {
        const it = itOf(r.identifier);
        const extra = extraById.get(r.identifier);
        const no = movedNo.get(r.identifier) || null;
        const from = basePos.get(r.identifier);
        const moved = !!from && from !== (i + 1);      // ★S2-3：只认"用户真挪过"（位置待定置顶造成的那点位移不算）
        const isNew = it && !it.mine && it.next;
        const onlyMine = it && it.mine && !it.next;
        const swDiff = it && it.enabledDiff;
        const d = it ? (S.decisions[it.key] || {}) : {};
        // ★"有变化"= 挪动 / 你新建的 / 内容有增删改 / 只有一边有 / 开关不同 / 改名
        //   （以前漏了"内容有增删改"，所以勾了它反而少了一大半 —— 用户实测）
        const contentChg = !!(it && (PM.needsChoice(it) || it.renamed));
        if (S.orderOnlyChanged && !(no || moved || isNew || onlyMine || swDiff || extra || contentChg)) return '';
        visIds.push(String(r.identifier));          // ★Wave W9-5：真的画出来了（= 用户看得见）—— 全选/计数按这一份走
        const swOn = it ? enabledOf(it, d) : r.enabled;
        const mk = extra ? { t: '你要加的', cls: 'ywpu-m-extra' } : rowMark(it);
        const meta = it ? statusMeta(it) : null;
        const on = sel.includes(r.identifier);
        const isLast = !on && S.lastSel === r.identifier;   // 只是点过（新建条目会插在它后面）
        // ★v4.3 用户："整齐为主：状态字（开关不同/两边一样/两边不同…）放同一列；
        //   它的左边才是开关怎么变的（On→Off），再左边才是被挪动的信息" →
        //   右边这一块做成**固定宽度的三列 + 靠右对齐**（原来谁有变化谁就把状态字挤歪）
        const posSlot = `${no ? `<span class="ywpu-ono" title="被挪动（第 ${no} 条）">${no}</span>` : ''}${moved ? `<span class="ywpu-ofrom">从第 ${from} 位挪来</span>` : ''}`;
        const swSlot = swDiff ? `<span class="ywpu-swdiff" title="你的 ${it.mine.enabled ? '开' : '关'} → 新版 ${it.next.enabled ? '开' : '关'}">${swPill(!!it.mine.enabled)}<span class="ywpu-arrow">→</span>${swPill(!!it.next.enabled)}</span>` : '';
        // ★§22：位置待定（锚点整条找不到 → 内核塞到末尾 → 咱们提到最前）逐条标出来，点它=跳到条目编辑页去改
        const pend = pendingBy.get(r.identifier) || null;
        const badgeSlot = extra ? '<span class="ywpu-of ywpu-of-new">你要加的</span>'
            : (pend ? '<span class="ywpu-of ywpu-of-pend" data-act="pend-jump" title="这条在你这份里找不到该插在哪（内核原话见下）；现在先放在最上面，你可以拖动，也可以在下面选「插在哪一条后面」">位置待定</span>'
                : (meta ? `<span class="ywpu-badge ${meta.cls}">${meta.badge}</span>` : ''));
        /* ★S2-3（UI P11）：**"没事发生"的行**（内容一样、无需处理、没挪过、没待定、没新建、开关也没差）
           手机上不该再占两行（徽标「两边一样」+ 胶囊「无需处理」+ 位次列全印在行里 → 一屏只有 8 行）。
           这一类行加 `ywpu-plain`：窄屏 CSS 把它的状态列/标记列收掉，只留行尾一颗弱色小圆点。
           宽屏一个像素都不变（PC 一屏 20 行本来就够紧）。 */
        const plain = !!(it && !extra && !pend && !no && !moved && !isNew && !onlyMine && !swDiff && !contentChg && mk.cls === 'ywpu-m-same');
        return `<div class="ywpu-orow ywpu-orow-big${plain ? ' ywpu-plain' : ''}${no ? ' ywpu-moved' : ''}${(moved || isNew || onlyMine || extra || pend) ? ' ywpu-newrow' : ''}${pend ? ' ywpu-pendrow' : ''}${on ? ' ywpu-selrow' : ''}${isLast ? ' ywpu-lastrow' : ''}${swOn === false ? ' ywpu-offrow' : ''}" data-ident="${esc(r.identifier)}"${it ? ` data-key="${esc(it.key)}"` : ''}${extra ? ' data-extra="1"' : ''} title="按住这一行上下拖 = 换位置（点一下 = 选中）">
            <!-- ★W19A-3 ②（作者拍板"修"）：勾选框与行尾标记的**可见盒**只有 15~20px，
                 手机上不到 AGENTS §5 的触摸下限（32）。手法按项目既定口径"**视觉可小、热区 ≥32**"：
                 各包一层「.ywpu-ocheckwrap」/「.ywpu-omarkwrap」，由**外层**用内边距把热区撑到 32
                 （外边距等量抵消 ⇒ 几何一个像素都不动），**里层那个圆点/胶囊的尺寸一点都不改**。
                 包 <label> 对 checkbox 是原生语义（点外层 = 点它），不需要任何 JS；
                 行尾标记那条点击绑定跟着挪到外层（见 renderOrderView 末尾的 bind），
                 它俩也一并加进"行点击/拖动时忽略"的名单（不然点热区会变成选中/拖这一行）。 -->
            <label class="ywpu-ocheckwrap"><input type="checkbox" class="ywpu-ocheck" ${on ? 'checked' : ''} title="勾选这一条（可多选；勾了就能批量操作/复制）"></label>
            <span class="ywpu-onum">${i + 1}</span>
            <span class="ywpu-oname">${esc(r.name)}</span>
            <span class="ywpu-oright">
                <span class="ywpu-ocell ywpu-ocell-pos">${posSlot}</span>
                <span class="ywpu-ocell ywpu-ocell-sw">${swSlot}</span>
                <span class="ywpu-ocell ywpu-ocell-badge">${badgeSlot}</span>
                <span class="ywpu-knobwrap" data-act="row-en-toggle" data-key="${esc(it ? it.key : '')}" data-ident="${esc(r.identifier)}" title="点一下：这一条在新预设里开/关">
                    <span class="ywpu-knob${swOn ? ' ywpu-knob-on' : ''}"><i></i></span>
                    <span class="ywpu-knob-txt">${swOn ? '开' : '关'}</span>
                </span>
                ${extra ? `<button class="ywpu-btn ywpu-mini ywpu-xbtn" data-act="extra-del" data-ident="${esc(r.identifier)}" title="删掉这条（只是不缝进新预设）">✕</button>` : ''}
                <span class="ywpu-omarkwrap"><span class="ywpu-omark ${mk.cls}" title="${esc(mk.t)}">${mk.t}</span></span>
            </span>
        </div>${pend ? posPickHtml(r.identifier, pend.how) : ''}`;
    }).join('');
    S.orderVisibleIds = visIds;      // ★Wave W9-5：这一轮**画出来**的那些（全选/计数读它；见上面那段注释）

    const selItemKeys = sel.map(id => keyByIdent.get(String(id))).filter(Boolean);

    host.innerHTML = `
<div class="ywpu-box">
    <!-- v4.2 用户："顶上'新预设总览'这 5 个字删掉" → 标题整行去掉，列表直接顶到最上面 -->
    <!-- v4.1 用户："最上边这些文字全部删掉，让下面内容顶上来" -->
    <div id="ywpu-extra-form" class="ywpu-extra-form" style="display:none">
        <div class="ywpu-row">
            <input class="ywpu-input" id="ywpu-extra-name" style="flex:1 1 200px" placeholder="条目名字（比如：📝我的补充规则）">
            <select class="ywpu-input" id="ywpu-extra-role" title="身份（跟 ST 里一样）">
                <option value="system">身份：系统</option>
                <option value="user">身份：用户</option>
                <option value="assistant">身份：助手</option>
            </select>
        </div>
        <textarea class="ywpu-textarea" id="ywpu-extra-body" rows="4" placeholder="这条的正文…"></textarea>
        <details class="ywpu-fold"><summary>高级：注入位置 / 深度 / 顺序 / 触发词</summary>
            <div class="ywpu-row">
                <label class="ywpu-chk">注入位置 <select class="ywpu-input" id="ywpu-extra-pos"><option value="0">按深度</option><option value="1">按顺序</option></select></label>
                <label class="ywpu-chk">深度 <input class="ywpu-input" id="ywpu-extra-depth" type="number" value="4" style="width:70px"></label>
                <label class="ywpu-chk">顺序 <input class="ywpu-input" id="ywpu-extra-order" type="number" value="100" style="width:80px"></label>
                <label class="ywpu-chk">触发词 <input class="ywpu-input" id="ywpu-extra-trigger" placeholder="逗号分隔，可留空"></label>
                <label class="ywpu-chk"><input type="checkbox" id="ywpu-extra-sysprompt" checked> 系统提示</label>
                <label class="ywpu-chk"><input type="checkbox" id="ywpu-extra-forbid"> 禁止覆盖</label>
            </div>
        </details>
        <div class="ywpu-row">
            <span class="ywpu-note">加进来以后可以在列表里拖动换位置；想复制现成的条目就用右边「⧉ 复制」。</span>
            <span class="ywpu-flex">
                <button class="ywpu-btn ywpu-mini" id="ywpu-extra-cancel">取消</button>
                <button class="ywpu-btn ywpu-mini ywpu-primary" id="ywpu-extra-add">加进新预设</button>
            </span>
        </div>
    </div>
</div>
<div class="ywpu-ocols ywpu-ocols-one">
    <div class="ywpu-ocol ywpu-ocol-merged">
        <div class="ywpu-ocol-body ywpu-ocol-body-tall">${rowsHtml || '<div class="ywpu-empty">没有匹配的条目</div>'}</div>
    </div>
</div>
<div class="ywpu-box" style="margin-top:8px">
    <div class="ywpu-row">
        <span class="ywpu-label">合并后用谁的顺序</span>
        <label class="ywpu-chk"><input type="radio" name="ywpu-order" value="next" ${S.orderMode === 'next' ? 'checked' : ''}> 跟新版（推荐）</label>
        <label class="ywpu-chk"><input type="radio" name="ywpu-order" value="mine" ${S.orderMode === 'mine' ? 'checked' : ''}> 跟我的</label>
        ${Array.isArray(S.orderOverride) && S.orderOverride.length ? '<button class="ywpu-btn ywpu-mini" id="ywpu-order-reset">恢复自动顺序</button>' : ''}
        ${S.dragUndo ? `<button class="ywpu-btn ywpu-mini ywpu-undodrag" id="ywpu-order-undo" title="把顺序逐位回到你拖动之前的样子">↩ 撤销拖动</button>` : ''}
        <span id="ywpu-order-hint" class="ywpu-note"></span>
    </div>
</div>`;

    const mbody = host.querySelector('.ywpu-ocol-body-tall');
    const keepTop = mbody ? mbody.scrollTop : 0;      // ★重绘前记住列表内部的滚动位置
    bindPosPick(host);                               // ★§22「插在哪一条后面」+ 点「位置待定」去编辑页
    host.querySelectorAll('.ywpu-of-pend[data-act="pend-jump"]').forEach(b => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const row = b.closest('.ywpu-orow');
        const key = row && row.getAttribute('data-key');
        if (key) focusItem(key);
    }));

    host.querySelectorAll('input[name="ywpu-order"]').forEach(r => r.addEventListener('change', function () {
        S.orderMode = this.value; getSettings().orderMode = this.value; saveSettings();
        S.orderOverride = null; renderOrderView();
    }));
    host.querySelector('#ywpu-order-reset')?.addEventListener('click', () => { S.orderOverride = null; renderOrderView(); toast('info', '已恢复自动顺序'); });
    host.querySelector('#ywpu-order-undo')?.addEventListener('click', () => { undoDrag(); });   // ★B13d：撤销拖动


    // 新建条目（缝预设）
    const form = host.querySelector('#ywpu-extra-form');
    host.querySelector('#ywpu-extra-cancel')?.addEventListener('click', () => { if (form) form.style.display = 'none'; });
    host.querySelector('#ywpu-extra-add')?.addEventListener('click', () => {
        const nm = (host.querySelector('#ywpu-extra-name')?.value || '').trim();
        const body = host.querySelector('#ywpu-extra-body')?.value || '';
        if (!nm) { toast('warning', '给这条起个名字'); return; }
        // 插在"勾选的第一条"或"最后点过的那条"后面（用户："点选了之后新建的就在它后边，不用手拖"）
        const anchor = (S.selIdents && S.selIdents[0]) || S.lastSel || null;
        const num = (id, dft) => { const v = parseFloat(host.querySelector(id)?.value); return Number.isFinite(v) ? v : dft; };
        extras().push({
            id: newExtraId(), name: nm, content: body, afterIdent: anchor,
            role: host.querySelector('#ywpu-extra-role')?.value || 'system',
            system_prompt: !!host.querySelector('#ywpu-extra-sysprompt')?.checked,
            injection_position: num('#ywpu-extra-pos', 0),
            injection_depth: num('#ywpu-extra-depth', 4),
            injection_order: num('#ywpu-extra-order', 100),
            injection_trigger: String(host.querySelector('#ywpu-extra-trigger')?.value || '').split(/[,，]/).map(t => t.trim()).filter(Boolean),
            forbid_overrides: !!host.querySelector('#ywpu-extra-forbid')?.checked,
        });
        S.orderOverride = null;
        renderOrderView(); renderFoot();
        toast('success', '加好了：' + nm + (anchor ? '（插在你选的那条后面）' : '（先放末尾，可拖动换位置）'));
    });
    // ⧉ 复制：把选中的条目复制一份（多选=一起复制）；没勾就用最后点过的那条
    host.querySelector('#ywpu-copy-sel')?.addEventListener('click', () => {
        const ids = (S.selIdents && S.selIdents.length) ? S.selIdents.slice() : (S.lastSel ? [S.lastSel] : []);
        if (!ids.length) { toast('warning', '先勾选要复制的条目（列表左边的小方框）'); return; }
        let n = 0;
        for (const id of ids) {
            const key = keyByIdent.get(String(id));
            const it2 = key ? an.items.find(x => x.key === key) : null;
            if (!it2) continue;
            extras().push(copyEntryOf(it2, S.decisions[it2.key] || {}));
            n++;
        }
        toast('success', '复制了 ' + n + ' 条（在列表里可以拖动换位置）');
        renderOrderView(); renderFoot();
    });
    host.querySelectorAll('[data-act="extra-del"]').forEach(b => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = b.getAttribute('data-ident');
        S.extraEntries = extras().filter(e => String(e.id) !== String(id));
        S.orderOverride = (S.orderOverride || []).filter(x => String(x) !== String(id));
        S.selIdents = (S.selIdents || []).filter(x => String(x) !== String(id));
        renderOrderView(); renderFoot();
    }));
    // 多选：勾选 / 批量动作
    host.querySelectorAll('.ywpu-ocheck').forEach(cb => cb.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const row = cb.closest('.ywpu-orow');
        const id = row ? row.getAttribute('data-ident') : null;
        if (!id) return;
        const set = new Set(S.selIdents || []);
        if (ev.shiftKey && S.lastSel) {                                  // shift 连选
            const ids = orderList.map(r => r.identifier);
            const a = ids.indexOf(S.lastSel), b = ids.indexOf(id);
            if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(ids[i]);
        } else if (cb.checked) set.add(id); else set.delete(id);
        S.selIdents = [...set]; S.lastSel = id;
        syncSelUi();          // ★就地更新：不重绘列表 → 不跳、也不会把没点完的框换掉
    }));
    const batchAction = (act) => {
        const keys = (S.selIdents || []).map(id => keyByIdent.get(String(id))).filter(Boolean);
        if (act === 'clear') { S.selIdents = []; renderOrderView(); return; }
        if (act === 'select-all') {
            /* ★Wave W9-5：**全选 = 选你看得见的那些**（跟随「筛选有变化的」）。
               改前拿 `orderList`（全量行）⇒ 筛选打开时会把看不见的行也勾进来，批量动作就作用到了用户看不见的条目上。
               `S.orderVisibleIds` = 上一次真画出来的行（renderOrderView 里通过同一个筛选判据后记的）；
               没渲染过（比如直接从条目页过来）就退回全量行 —— 那时屏幕上也没有"被筛掉的行"这回事。 */
            const ids = (Array.isArray(S.orderVisibleIds) && S.orderVisibleIds.length) ? S.orderVisibleIds.slice() : orderList.map(r => r.identifier);
            const selSet = new Set((S.selIdents || []).map(String));
            S.selIdents = (ids.length && ids.every(id => selSet.has(String(id)))) ? [] : ids;
            renderOrderView(); return;
        }
        if (act === 'filter-changed') { S.orderOnlyChanged = !S.orderOnlyChanged; renderOrderView(); return; }
        if (act === 'cmp') { openOrderCompare(); return; }
        if (act === 'new-entry') {
            const form = document.getElementById('ywpu-extra-form');
            if (form) { form.style.display = form.style.display === 'none' ? '' : 'none'; if (form.style.display !== 'none') { const i = form.querySelector('#ywpu-extra-name'); if (i) i.focus(); } }
            return;
        }
        if (!keys.length) { toast('warning', '先点几条选中（或点「全选」）'); return; }
        // ★全用我的 / 全用新版：再点一次 = 撤销（用户要求）
        if (act === 'mine' || act === 'next') { bulkUseSide(act, keys); return; }
        for (const key of keys) {
            const it = an.items.find(x => x.key === key);
            if (!it) continue;
            S.keepVisible[key] = true;
            if (act === 'mine' || act === 'next') {
                S.decisions[key] = { ...(S.decisions[key] || {}), source: act, blockDecision: {}, customText: '', customEdited: false };
            } else if (act === 'on' || act === 'off') {
                S.decisions[key] = { ...(S.decisions[key] || {}), enabled: act === 'on' };
            } else if (act === 'copy') {
                extras().push(copyEntryOf(it, S.decisions[key] || {}));
            }
        }
        if (act === 'copy') { S.orderOverride = null; toast('success', '复制了 ' + keys.length + ' 条（在列表里可以拖动）'); }
        else toast('success', ({ mine: '已全用我的', next: '已全用新版', on: '已打开', off: '已关掉' })[act] + '：' + keys.length + ' 条');
        if (act === 'copy') { renderOrderView(); } else {
            // 就地刷新每行的开关/标记（不重绘 → 不跳）
            document.querySelectorAll('#ywpu-view-order .ywpu-orow[data-key]').forEach(row => {
                const k = row.getAttribute('data-key'); const it2 = an.items.find(x => x.key === k);
                if (!it2) return;
                const d2 = S.decisions[k] || {};
                const sw2 = enabledOf(it2, d2);
                const kb = row.querySelector('.ywpu-knob'); if (kb) kb.classList.toggle('ywpu-knob-on', sw2);
                const tx = row.querySelector('.ywpu-knob-txt'); if (tx) tx.textContent = sw2 ? '开' : '关';
                const om = row.querySelector('.ywpu-omark');
                if (om) { const mk2 = rowMark(it2); om.className = 'ywpu-omark ' + mk2.cls; om.textContent = mk2.t; om.title = mk2.t; }
            });
        }
        renderFoot();
        if (batchBarRenderer) batchBarRenderer();
    };

    // 批量条按钮：动态生成 → 用事件委托（只绑一次）
    host.onclick = (e) => {
        const b = e.target.closest('[data-batch]');
        if (b) { e.preventDefault(); batchAction(b.getAttribute('data-batch')); }
    };

    /** ★A2（文案评审 M-02 · 2026-09-23）：总览页批量条的「全用我的 / 全用新版」——
     *  它跟筛选区那两颗"一键"**同源**（都会清掉 `blockDecision/customText/customEdited`：
     *  逐处挑过的选择 + 手改过的文字），而且"再点一次"只是回到"还没选"、**不是还原** ⇒
     *  真会丢东西（勾中的那几条里有人工痕迹）时**先弹一次确认**；干干净净的照旧一点就动（不添麻烦）。 */
    function bulkUseSide(act, keys) {
        const allAlready = keys.every(k => (S.decisions[k] || {}).source === act);
        const lab = act === 'mine' ? '我的' : '新版';
        const dirty = keys.filter(k => {
            const c = S.decisions[k] || {};
            return Object.keys(c.blockDecision || {}).length || c.customEdited || (typeof c.customText === 'string' && c.customText);
        });
        if (dirty.length && !allAlready) {
            askYes('这 ' + keys.length + ' 条全用' + lab + '？', [
                '其中 **' + dirty.length + '** 条你已经逐处挑过或手改过文字。',
                '点「确定」：这 ' + keys.length + ' 条全按' + lab + '来 —— 逐处挑的选择会被改掉、手改的字会没（**不可撤销**）。',
                '点「算了」：什么都不做，你的选择原样留着。'
                    + '（"再点一次"只回到「还没选」，**不是**把刚才那些还回来。）',
            ], { ok: '全部用' + lab, cancel: '算了' }).then(ok => { if (ok) bulkUseSideNow(act, keys); else toast('info', '没有动：你的选择原样留着'); });
            return;
        }
        bulkUseSideNow(act, keys);
    }
    function bulkUseSideNow(act, keys) {
        const allAlready = keys.every(k => (S.decisions[k] || {}).source === act);
        for (const key of keys) {
            S.keepVisible[key] = true;
            S.decisions[key] = { ...(S.decisions[key] || {}), source: allAlready ? null : act, blockDecision: {}, customText: '', customEdited: false };
        }
        toast('success', (allAlready ? '已撤销：' : (act === 'mine' ? '已全用我的：' : '已全用新版：')) + keys.length + ' 条'
            + (allAlready ? '（★这不是还原：逐处挑的选择、手改的字都不会回来）' : ''));
        renderOrderView(); renderFoot();
    }

    // 开关拨钮：就地更新（不重画列表 → 绝不跳位置）
    host.querySelectorAll('[data-act="row-en-toggle"]').forEach(k => k.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const key = k.getAttribute('data-key');
        const ident = k.getAttribute('data-ident');
        const it = an.items.find(x => x.key === key);
        const cur = it ? (S.decisions[key] || {}) : {};
        const now = it ? enabledOf(it, cur) : true;
        const want = !now;
        if (it) S.decisions[key] = { ...cur, enabled: want };
        else {                                            // 新建/复制的条目：直接改它自己的开/关
            const e2 = extras().find(e => String(e.id) === String(ident));
            if (e2) e2.enabled = want;
        }
        k.querySelector('.ywpu-knob')?.classList.toggle('ywpu-knob-on', want);
        const txt = k.querySelector('.ywpu-knob-txt'); if (txt) txt.textContent = want ? '开' : '关';
        toast('info', '新预设里这条：' + (want ? '开' : '关'));
        renderFoot();
    }));
    // 批量条：可就地重画（勾选时也要立刻出现）
    batchBarRenderer = () => {
        const host2 = $el('#ywpu-view-order');
        if (!host2) return;
        const n = (S.selIdents || []).length;
        /* ★Wave W9-5：勾着的条目里**被「筛选有变化的」挡住、现在看不见**的有几条。
           改前那句只写「已选 N 条」—— 而批量动作按的是 `S.selIdents`（含看不见的那些）⇒ 数字对得上、屏幕对不上
           （用户以为只对看得见的这几条生效）。现在把"看不见的那几条"**明说出来**（下面的 title 与正文各一份）。
           判据 = 不在 `S.orderVisibleIds`（= 上一次真画出来的行）里的那些；没渲染过时这一份为空 ⇒ 照旧一个字不加。 */
        const vis = Array.isArray(S.orderVisibleIds) ? S.orderVisibleIds : null;
        const hiddenSel = vis ? (S.selIdents || []).filter(id => vis.indexOf(String(id)) < 0).length : 0;
        let bar = host2.querySelector('.ywpu-batchbar');
        // ★常驻：不管有没有勾都占着这一行（勾选时不再把列表往下挤 —— 用户要求的）
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'ywpu-batchbar';
            const anchor = host2.querySelector('.ywpu-box');
            if (anchor) anchor.after(bar); else host2.prepend(bar);
        }
        bar.classList.toggle('ywpu-batchbar-idle', !n);
        /* ★R9-i：390 档那句提示被 CSS 收掉（否则按钮被挤到第二行）—— 把同一句话挂到条本身上，
           hover 长按都还能看到"这条是干什么的"。 */
        const hintTail = hiddenSel ? ('（其中 ' + hiddenSel + ' 条被「筛选有变化的」挡住、现在看不见）') : '';
        bar.title = n ? ('已选 ' + n + ' 条' + hintTail) : '勾选条目后可批量操作：用我的 / 用新版 / 复制 / 开 / 关';
        /* ★S2-4（UI P12 + 文案 §C8）：**没勾选时压成一行**。
           原来 10 颗等权小按钮常驻（手机上折 2 行 ≈120px），其中「用我的/用新版/复制/开/关」没勾选时
           点不出任何有意义的结果，真正要用的「筛选有变化的」「看顺序对比」反而被埋在里面。
           现在：没勾选 → 只留一句灰字提示 + 全选 + ＋新建条目 + 筛选有变化的 + 看顺序对比（一行）；
                 勾了 → 其余批量动作（`ywpu-bulk`）才出现。
           ★DOM 里**十颗按钮一直在**（只加 `ywpu-bulk` 由 CSS 收起）—— 程序化 `.click()` 与老断言不受影响。 */
        const selKeys = (S.selIdents || []).map(id => keyByIdent.get(String(id))).filter(Boolean);
        const allSel = selKeys.length > 0;
        const allMine = allSel && selKeys.every(k => (S.decisions[k] || {}).source === 'mine');
        const allNext = allSel && selKeys.every(k => (S.decisions[k] || {}).source === 'next');
        /* ★Wave W9-5：判"是不是已经全选"也用**看得见的那一份**（与「全选」按钮的行为同一个判据 ——
           改前按全量行判，筛选开着时屏幕上明明还有没勾的、按钮却已经写着「取消全选」= 名不副实）。 */
        const everySelected = vis
            ? (vis.length > 0 && vis.every(id => (S.selIdents || []).indexOf(String(id)) >= 0))
            : (orderList.length > 0 && (S.selIdents || []).length >= orderList.length);
        bar.innerHTML = '<span class="ywpu-batchhint" title="' + (n ? '已选 ' + n + ' 条' + hintTail : '勾选条目后可以批量：用我的 / 用新版 / 复制 / 开 / 关') + '">'
            + (n ? '已选 <b>' + n + '</b> 条' + (hiddenSel ? '<span class="ywpu-batchhide" title="这 ' + hiddenSel + ' 条被「筛选有变化的」挡住了、你现在看不见；批量动作**照样会作用到它们**（想只对看得见的动手：先取消筛选、或先点「取消选择」再逐条勾）">（含 ' + hiddenSel + ' 条看不见的）</span>' : '') : '勾选条目后可批量操作') + '</span>'
            + '<button class="ywpu-btn ywpu-mini" data-batch="select-all">' + (everySelected ? '取消全选' : '全选') + '</button>'
            + '<button class="ywpu-btn ywpu-mini ywpu-bulk' + (allMine ? ' ywpu-sel' : '') + '" data-batch="mine" title="再点一次=撤销">用我的</button>'
            + '<button class="ywpu-btn ywpu-mini ywpu-bulk' + (allNext ? ' ywpu-sel' : '') + '" data-batch="next" title="再点一次=撤销">用新版</button>'
            + '<button class="ywpu-btn ywpu-mini ywpu-bulk" data-batch="copy">复制</button>'
            + '<button class="ywpu-btn ywpu-mini" data-batch="new-entry">＋ 新建条目</button>'
            + '<button class="ywpu-btn ywpu-mini ywpu-bulk" data-batch="on">开</button>'
            + '<button class="ywpu-btn ywpu-mini ywpu-bulk" data-batch="off">关</button>'
            + '<button class="ywpu-btn ywpu-mini' + (S.orderOnlyChanged ? ' ywpu-sel' : '') + '" data-batch="filter-changed">筛选有变化的</button>'
            + '<button class="ywpu-btn ywpu-mini" data-batch="cmp">看顺序对比</button>'
            + (n ? '<button class="ywpu-btn ywpu-mini ywpu-bulk" data-batch="clear">取消选择</button>' : '');
    };
    batchBarRenderer();

    // ★在条目身上按下并上下滑动 = 批量选中/取消
    // ★v4.4：和"拖动换位置"共用同一次按下 → 用 holdArmed / holdTimer 区分（按住 220ms = 换位置）
    let selArmed = null;
    let holdTimer = 0;          // 长按计时器（换位置）
    let holdArmed = null;       // 已经进入"换位置"模式的那一条 → 涂选必须停手

    // ★按下就切换这一条；上下移动时把指针下的行刷成同一个状态（拖回去 = 批量取消）
    mbody && mbody.addEventListener('mousedown', (ev) => {
        const el = ev.target.closest('.ywpu-orow');
        if (!el) return;
        if (ev.target.closest('button, input, .ywpu-knobwrap, .ywpu-grab, .ywpu-omark, .ywpu-ocheck, .ywpu-omarkwrap, .ywpu-ocheckwrap')) return;
        const ident = el.getAttribute('data-ident');
        if (!ident) return;
        selArmed = { ident, want: !(S.selIdents || []).includes(ident) };
        if (ev.cancelable) ev.preventDefault();    // ★别让浏览器去选文字（那会把 mousemove 抢走）
        suppressClickUntil = Date.now() + 400;      // 这一下由 mousedown 处理，别再走 click（否则会翻两次）
        setRowSel(ident, selArmed.want, true);
        holdArmed = null;                           // 新一次按下 → 重置"换位置"标记（计时器由拖动那块负责启动）
    });
    // ★用 mousemove（每次移动都触发）而不是 mouseover（只在跨元素时触发，拖动中容易漏）
    document.addEventListener('mousemove', (ev) => {
        S.__mm = (S.__mm || 0) + 1; S.__armed = !!selArmed; S.__lastMM = { x: ev.clientX, y: ev.clientY };
        if (!selArmed) return;
        if (holdArmed) return;                       // ★v4.4：已经进入"换位置"模式 → 别再涂选了
        // ★用坐标命中（elementFromPoint）而不是 ev.target：拖动时 target 不一定跟着走
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        const el = hit && hit.closest ? hit.closest('.ywpu-orow') : null;
        if (!el) return;
        const ident = el.getAttribute('data-ident');
        if (!ident) return;
        const has = (S.selIdents || []).includes(ident);
        if (has === selArmed.want) return;          // 已经是目标状态
        setRowSel(ident, selArmed.want, true);
    });
    document.addEventListener('mouseup', () => {
        if (selArmed && batchBarRenderer) batchBarRenderer();   // 松手才把批量条插进来（免得把行推走）
        selArmed = null;
    });
    // ★这些状态必须在"点行"处理器**之前**声明：处理器要用 dragging/suppressClickUntil，
    //   声明在下面的 if(mbody){} 里会报 "dragging is not defined"（实测真 BUG）
    let dragEl = null, dragIdent = '', baseList = [], ghost = null, line = null;
let dragging = false, startY = 0, rafId = 0, scrollDir = 0, suppressClickUntil = 0;
    let lastPointerY = null;                   // 指针最后的位置（自动滚动时用它重放落点线）
    // ★点条目 = 选中/取消（用户："点击哪个条目 哪个条目就是被选择"）；进编辑改成点末尾的状态标记
    host.querySelectorAll('.ywpu-orow').forEach(r => r.addEventListener('click', (ev) => {
        if (ev.target.closest('button, input, .ywpu-knobwrap, .ywpu-grab, .ywpu-omark, .ywpu-omarkwrap, .ywpu-ocheckwrap')) return;
        if (dragging || Date.now() < suppressClickUntil) return;
        toggleRowSel(r.getAttribute('data-ident'));
    }));
    // 末尾的状态标记 = 进这一条的详细编辑（并记住来路，方便「← 回总览」）
    host.querySelectorAll('.ywpu-orow .ywpu-omarkwrap').forEach(m => m.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const row = m.closest('.ywpu-orow');
        const key = row && row.getAttribute('data-key');
        if (!key) return;
        S.returnIdent = row.getAttribute('data-ident');
        focusItem(key);
    }));

    // 拖动换位置（多选时整组一起挪）：落点 = 一条细横线
    if (mbody) {
        const hint = $el('#ywpu-order-hint');
        const rows = () => [...mbody.querySelectorAll('.ywpu-orow')];
        /** ★B14：提示条带"高亮态"（拖动中 / 长按成立）—— `live=true` 时它变成一枚醒目的胶囊，
         *  用户一眼就知道"我现在在拖动状态里"（原来只有一行小灰字，作者说"反馈差"）。 */
        const setHint = (t, live) => {
            if (!hint) return;
            hint.textContent = t || '';
            hint.classList.toggle('ywpu-hint-live', !!live && !!t);
        };
        const ensureLine = () => {
            if (!line || !line.isConnected) { line = document.createElement('div'); line.className = 'ywpu-dropline'; }
            return line;
        };
        const slotIndex = () => {
            if (!line || !line.isConnected) return -1;
            let before = 0;
            for (const r of rows()) {
                if (r === dragEl) continue;
                if (line.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_PRECEDING) before++;
            }
            return before;
        };
        /** ★V②：落点线 + **占位块实时重排**（跟条目编辑页同一套 `liveReorderRow` —— 两页行为必须一致）。
         *  被拖的那一行留在列表里当占位块，按指针就地跟邻居换位；线永远贴在它前面。
         *  几何现读（不动 margin/padding）⇒ 判定与观感一致；v3.3-7 那条"自动滚动后按指针重放"照样成立
         *  （autoScroll 每帧还是用 lastPointerY 调它）。 */
        const moveLine = (y) => {
            const ln = ensureLine();
            const at = dragEl ? liveReorderRow(dragEl, rows, y) : -1;
            if (at < 0) {
                // 兜底（还没进拖动态）：老口径 —— 按指针几何插线
                const others = rows().filter(r => r !== dragEl);
                let placed = false, slot = others.length;
                for (let i = 0; i < others.length; i++) {
                    const b = others[i].getBoundingClientRect();
                    if (y < b.top + b.height / 2) { others[i].before(ln); placed = true; slot = i; break; }
                }
                if (!placed) mbody.appendChild(ln);
                others.forEach((r, i) => r.classList.toggle('ywpu-giveway', i === slot - 1));
                return;
            }
            dragEl.before(ln);
            const all = rows();
            const k = all.indexOf(dragEl);
            // ★"我给它让位"（纯视觉）：占位块**上面**那一行 —— 换位之后的真实几何
            all.forEach((r, i) => r.classList.toggle('ywpu-giveway', i === k - 1));
        };
        const autoScroll = () => {
            if (!dragging) { rafId = 0; return; }
            if (scrollDir) {
                mbody.scrollTop += scrollDir * 8;
                // ★滚动之后必须"按指针最后的位置"重新放一次落点线，
                //   否则线被滚到列表最上面 → 条目被插到最前（用户实测的 BUG）
                if (lastPointerY != null) moveLine(lastPointerY);
            }
            rafId = requestAnimationFrame(autoScroll);
        };
        const group = () => (S.multiSel && S.selIdents && S.selIdents.includes(dragIdent)) ? S.selIdents.slice() : [dragIdent];
        // ★★v4.4 修 BUG（用户："我想拖它换位置，拖到哪里其它行就全被勾选了"）：
        //   根因 = 同一个 mousedown 上挂了**两套手势**：① 按下=涂选 ② 按下=拖动换位置；
        //   v4.1 删掉 ⠿ 手柄后，"按在行身上"同时触发两套 → 拖动时一路涂选 ✗
        //   修法（按用户建议"加个时间限制"）：**按住不动 220ms 才进入换位置模式**；
        //   在这之前指针一动（>6px）就算涂选，长按计时器随即取消 —— 两个手势不再打架。
        const HOLD_MS = 220;
        let pressEl = null;
        const pointerY = (ev) => (ev.touches ? ev.touches[0].clientY : ev.clientY);
        const startDrag = (el) => {
            dragEl = el; dragIdent = el.getAttribute('data-ident');
            baseList = orderList.map(x => x.identifier);
            dragging = false;
            startY = lastPointerY != null ? lastPointerY : 0;
            holdArmed = dragIdent;                              // 告诉"涂选"那边：别再刷了
            noSelOn();                                          // ★V①：长按成立 → 整页禁选（松手在 onUp 撤）
            setHint('按住成功：现在上下拖 = 换位置', true);      // ★B14：长按成立 → 提示条立刻高亮（"我在拖动态了"）
        };
        const onDown = (ev) => {
            const el = ev.target.closest('.ywpu-orow');
            // ★v4.1 用户："那个 emoji（⠿）删掉" → 手柄不画了，整行都能按（除了勾选框/拨钮/标记/按钮）
            if (!el || ev.target.closest('input, button, select, .ywpu-knobwrap, .ywpu-ocheck, .ywpu-omark, .ywpu-omarkwrap, .ywpu-ocheckwrap, .ywpu-grab, .ywpu-of-pend')) return;
            lastPointerY = pointerY(ev);
            holdArmed = null;
            pressEl = el;
            clearTimeout(holdTimer);
            holdTimer = setTimeout(() => { if (pressEl === el && !dragging) startDrag(el); }, HOLD_MS);
        };
        const onMove = (ev) => {
            // 还没进入"换位置"模式时，只要动了就说明是涂选 → 取消长按计时
            if (!dragEl && holdTimer && Math.abs(pointerY(ev) - (lastPointerY != null ? lastPointerY : pointerY(ev))) > 6) {
                clearTimeout(holdTimer); holdTimer = 0;
            }
            if (!dragEl) return;
            const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
            if (!dragging) {
                if (Math.abs(y - startY) < 6) return;
                dragging = true;
                const box = dragEl.getBoundingClientRect();
                dragEl.classList.add('ywpu-dragging');
                mbody.classList.add('ywpu-dragmode');            // ★B14：整块列表进"拖动中"态（见 CSS）
                // ★V①：面板/整页的"禁选"由 `noSelOn()` 在**长按成立**时就加了（这里不再重复加，见 onUp 的 noSelOff）
                const ln = ensureLine();
                dragEl.before(ln);                               // ★V②：线贴在占位块**前面**（= 会插到这一行之前）
                ghost = document.createElement('div');
                ghost.className = 'ywpu-ghost ywpu-ghost-lift';  // ★B14：抬起来的影子（放大 + 阴影 + 微旋）
                const g = group();
                ghost.textContent = (dragEl.querySelector('.ywpu-oname')?.textContent || '') + (g.length > 1 ? '　＋另外 ' + (g.length - 1) + ' 条' : '');
                ghost.style.maxWidth = Math.min(420, box.width) + 'px';
                document.body.appendChild(ghost);
                if (!rafId) rafId = requestAnimationFrame(autoScroll);
            }
            if (ghost) {
                const x = ev.touches ? ev.touches[0].clientX + 12 : ev.clientX + 12;
                ghost.style.left = x + 'px'; ghost.style.top = (y - 14) + 'px';
                ghost.setAttribute('data-slot', String(slotIndex() + 1));   // ★B14：影子上带"会落到第几"
            }
            lastPointerY = y;
            moveLine(y);
            const mb = mbody.getBoundingClientRect();
            scrollDir = y < mb.top + 24 ? -1 : (y > mb.bottom - 24 ? 1 : 0);
            // ★B14：拖动中那句提示更醒目（加了"拖动中"前缀 + 高亮态）
            setHint('🔒 拖动中 · 松手放到第 ' + (slotIndex() + 1) + ' 位', true);
            if (ev.cancelable) ev.preventDefault();
        };
        const onUp = () => {
            clearTimeout(holdTimer); holdTimer = 0; pressEl = null; holdArmed = null;
            noSelOff();          // ★V①：这条路上后面有 3 个 return，撤在这儿最稳（绝不留残留）
            if (!dragEl) return;
            const wasDragging = dragging;
            const g = group();
            const from = baseList.indexOf(dragIdent);
            const to = slotIndex();
            const before = Array.isArray(S.orderOverride) ? S.orderOverride.slice() : null;   // ★B13d：拖动前的初始位置
            dragEl.classList.remove('ywpu-dragging');
            if (ghost) { ghost.remove(); ghost = null; }
            if (line) { line.remove(); line = null; }
            mbody.classList.remove('ywpu-dragmode');
            // ★V①：`ywpu-drag-on`（面板内禁选）由 onUp 开头的 `noSelOff()` 一起撤掉了
            mbody.querySelectorAll('.ywpu-giveway').forEach(r => r.classList.remove('ywpu-giveway'));   // ★B14：清掉让位高亮
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            scrollDir = 0;
            dragEl = null; dragging = false; lastPointerY = null;
            // ★只有真的拖动过才抑制（以前每次都设，结果"点一行"的 click 也被吃掉 → 点行不跳转）
            if (wasDragging) suppressClickUntil = Date.now() + 400;
            if (!wasDragging) { setHint(''); return; }
            if (to < 0 || to === from) { setHint(''); return; }
            const list = [...baseList];
            const moving = g.filter(id => id !== dragIdent);
            list.splice(from, 1);
            for (const id of moving) { const i2 = list.indexOf(id); if (i2 >= 0) list.splice(i2, 1); }
            list.splice(Math.max(0, to - moving.filter(id => baseList.indexOf(id) < from).length), 0, dragIdent, ...moving);
            S.orderOverride = list;
            // ★B13d：记一条可撤销的拖动（顺序页拖动也归它管）——"↩ 撤销拖动"就在这页底部那颗「恢复自动顺序」旁边
            // ★§BY-H：作者点名"新预设总览里是不是同一个 BUG" —— 是（这两处写的是同一份 S.dragUndo），
            //   所以这里也走同一个 undoRecordFor：同一串拖动只保留最初那份 before（多拖一次撤销 = 回到最初）。
            S.dragUndo = undoRecordFor(S.dragUndo, dragIdent, before, Date.now());
            renderOrderView();
            toast('info', (g.length > 1 ? '整组 ' + g.length + ' 条' : '这条') + '已挪到第 ' + (list.indexOf(dragIdent) + 1) + ' 位'
                + '（想退回原样：点底部的「↩ 撤销拖动」）');
        };
        mbody.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        mbody.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);

        // ★重绘后把列表内部的滚动位置还回去（用户："点任何地方都不能跳回最上面"）
        if (keepTop) mbody.scrollTop = keepTop;
    }
    applyAutoInkAll();                              // ★R7：顺序页重绘后过一遍兜底
}
/** 弹窗：『你的顺序 vs 新版顺序』两列对照（顺序页默认只留一列，避免手机挤爆） */
function openOrderCompare() {
    const an = S.analysis;
    if (!an) return;
    const od = an.order;
    const keyByIdent = new Map();
    for (const it of an.items) {
        if (it.next) keyByIdent.set(String(it.next.identifier), it.key);
        if (it.mine) keyByIdent.set(String(it.mine.identifier), it.key);
    }
    const movedNo = new Map();
    od.moved.forEach((m, i) => { movedNo.set(String(m.nextId), i + 1); movedNo.set(String(m.mineId), i + 1); });
    const rowOf = (r, side) => {
        const no = movedNo.get(String(r.identifier)) || null;
        const flag = side === 'mine'
            ? (r.onlyMine ? '<span class="ywpu-of ywpu-of-only">新版没有</span>' : '')
            : (r.pairGuess ? '<span class="ywpu-of ywpu-of-only">疑似改名</span>'
                : r.isNew ? '<span class="ywpu-of ywpu-of-new">新版新增</span>' : '');
        return `<div class="ywpu-orow${no ? ' ywpu-moved' : ''}${(r.isNew || r.onlyMine || r.pairGuess) ? ' ywpu-newrow' : ''}" data-key="${esc(keyByIdent.get(String(r.identifier)) || '')}">
            <span class="ywpu-onum">${r.index}</span><span class="ywpu-oname">${esc(r.name)}</span>${flag}${no ? `<span class="ywpu-ono">${no}</span>` : ''}
        </div>`;
    };
    let host = $el('#ywpu-cmp');
    if (!host) {
        host = document.createElement('div');
        host.id = 'ywpu-cmp';
        host.innerHTML = '<div id="ywpu-cmp-card"><div id="ywpu-cmp-head"></div><div id="ywpu-cmp-body"></div></div>';
        document.body.appendChild(host);
        applyColors();                                   // 新窗口也要穿上用户选的颜色（v3.8）
        // ★只有「关闭」关（作者："所有弹出的界面都必须手点 ✕ 才关"）：遮罩点击不再关 + 挡 ST 那层抽屉收起
        guardOverlay(host);
    }
    host.classList.add('ywpu-open');
    $el('#ywpu-cmp-head').innerHTML = `<b>顺序对照：你的 vs 新版</b> <span class="ywpu-sub">同号 ①②③ = 同一条被挪动</span>
        <span class="ywpu-flex"><button class="ywpu-btn ywpu-mini" id="ywpu-cmp-close">关闭</button></span>`;
    $el('#ywpu-cmp-body').innerHTML = `
<div class="ywpu-ocols">
    <div class="ywpu-ocol"><div class="ywpu-ocol-t">你的顺序（${od.counts.mineTotal} 条）</div><div class="ywpu-ocol-body">${od.mineList.map(r => rowOf(r, 'mine')).join('')}</div></div>
    <div class="ywpu-ocol"><div class="ywpu-ocol-t">新版顺序（${od.counts.nextTotal} 条）</div><div class="ywpu-ocol-body">${od.nextList.map(r => rowOf(r, 'next')).join('')}</div></div>
</div>`;
    $el('#ywpu-cmp-close').addEventListener('click', () => host.classList.remove('ywpu-open'));
    $el('#ywpu-cmp-body').querySelectorAll('.ywpu-orow[data-key]').forEach(r => r.addEventListener('click', function () {
        const key = this.getAttribute('data-key');
        if (!key) return;
        host.classList.remove('ywpu-open');
        openItemSheet(key);
    }));
}

/** 弹出面板：看/改某一条（顺序页点行时用；关掉就回到顺序页原来的位置） */
function openItemSheet(key) {
    const it = S.analysis?.items.find(x => x.key === key);
    if (!it) return;
    S.expanded[key] = true;
    let host = $el('#ywpu-sheet');
    if (!host) {
        host = document.createElement('div');
        host.id = 'ywpu-sheet';
        host.innerHTML = '<div id="ywpu-sheet-card"><div id="ywpu-sheet-head"></div><div id="ywpu-sheet-body"></div></div>';
        document.body.appendChild(host);
        applyColors();                                   // 新窗口也要穿上用户选的颜色（v3.8）
        // ★只有「关闭（回顺序页）」关：遮罩点击不再关（原来 `e.target === host` 就关）+ Esc 不再关（原来这条已删）
        //   + 挡 ST 那层"点浮层里任何地方 → 扩展抽屉收起"（见 guardOverlay）
        guardOverlay(host);
    }
    host.classList.add('ywpu-open');
    renderSheet(key);
    bindListEvents($el('#ywpu-sheet-body'));
}
function closeItemSheet() { const h = $el('#ywpu-sheet'); if (h) h.classList.remove('ywpu-open'); }
function renderSheetIfOpen() {
    const h = $el('#ywpu-sheet');
    if (!h || !h.classList.contains('ywpu-open')) return;
    const key = h.getAttribute('data-key');
    if (key) renderSheet(key);
}
function renderSheet(key) {
    const h = $el('#ywpu-sheet');
    const it = S.analysis?.items.find(x => x.key === key);
    if (!h || !it) return;
    const card = $el('#ywpu-sheet-card');
    const keepTop = card ? card.scrollTop : 0;      // 重绘前记住（点第 2/3 处后不再跳回顶部）
    h.setAttribute('data-key', key);
    const nm = it.next?.name || it.mine?.name || '(未命名)';
    const meta = statusMeta(it);
    const decS = decOf(it);
    /* ★W14 ④⑤⑥：与条目行**同一套口径**（绿 = 我已选择；不再跟那颗虚线牌子）。
       改前这里是 `decS.source` ⇒ "只有开关不同"那种（决策里只有 `enabled`、没有 `source`）**永远不亮**，
       而"新版新增 / 只有我有"选完之后又会落回「两边一样」—— 现在统一用内核 `itemDecided`。 */
    const sheetDecided = PM.needsChoice(it) && PM.itemDecided(it, decS);
    $el('#ywpu-sheet-head').innerHTML = (sheetDecided
        ? '<span class="ywpu-badge ywpu-st-chosen">我已选择</span>'
        : `<span class="ywpu-badge ${meta.cls}">${meta.badge}</span>`) + `<b>${esc(nm)}</b>
        <span class="ywpu-flex"><button class="ywpu-btn ywpu-mini" id="ywpu-sheet-close">关闭（回顺序页）</button></span>`;
    $el('#ywpu-sheet-body').innerHTML = itemHtml(it);
    $el('#ywpu-sheet-close').addEventListener('click', () => closeItemSheet());
    if (card) card.scrollTop = keepTop;             // 恢复滚动位置（真 BUG 修复）
    applyAutoInkAll();                              // ★R7：条目面板重绘后过一遍兜底
}

/** 跳到条目页展开某一条（给"去看这条"用） */
function focusItem(key) {
    if (!key) return;
    S.view = 'items';
    S.curKey = key;                 // ★v4.0：记下"当前停在哪一条"，上一条/下一条 用它当锚点
    const it = S.analysis?.items.find(x => x.key === key);
    if (it && !matchFilter(it, S.filter, PM)) S.filter = 'all';
    /* ★W110-A（顺带修的死路）：条目那一摊收着（scopeItems=false）时"下一条/回去挑"根本滚不过去
       （目标行不在 DOM 里）—— W110 起「全部」一点就能把两摊收起来，这条路会被更容易踩到 ⇒ 先摊开再跳。 */
    if (S.scopeItems === false) S.scopeItems = true;
    if (getSettings().accordion !== false) S.expanded = { [key]: true };
    else S.expanded = { ...S.expanded, [key]: true };
    renderView();
    setTimeout(() => {
        const node = document.querySelector('.ywpu-item[data-key="' + (window.CSS?.escape ? CSS.escape(key) : key) + '"]');
        if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });   // ★定位到这一条的最上面（用户要求）
            node.classList.add('ywpu-flash');
            setTimeout(() => node.classList.remove('ywpu-flash'), 1400);
        }
    }, 60);
}

function orderRowHtml(r, side, mark, key, movedNo, autoPos) {
    const no = movedNo ? movedNo.get(String(r.identifier)) : null;
    const changed = !!(no || r.isNew || r.onlyMine || r.pairGuess);
    const flag = side === 'mine'
        ? (r.onlyMine ? '<span class="ywpu-of ywpu-of-only">新版没有</span>' : '')
        : side === 'next'
            ? (r.pairGuess ? '<span class="ywpu-of ywpu-of-only">疑似改名</span>'
                : r.isNew ? '<span class="ywpu-of ywpu-of-new">新版新增</span>' : '')
            : '';
    const mk = mark && mark.t ? `<span class="ywpu-omark ${mark.cls}">${mark.t}</span>` : '';
    const noBadge = no ? `<span class="ywpu-ono" title="被挪动（第 ${no} 条）">${no}</span>` : '';
    let movedFrom = '';
    if (side === 'merged' && autoPos) {
        const a = autoPos.get(r.identifier);
        if (a && a !== r.index) movedFrom = `<span class="ywpu-ofrom">从第 ${a} 位挪来</span>`;
    }
    const sel = (side === 'merged' && S.orderSel === r.identifier) ? ' ywpu-selrow' : '';
    const grab = '';   // v4.1 用户：把 ⠿ 图标删掉（那两列对照窗口不用它）
    const dim = (side === 'merged' || changed) ? '' : (mark && mark.t === '✓' ? ' ywpu-dimrow' : '');
    return `<div class="ywpu-orow${no ? ' ywpu-moved' : ''}${(r.isNew || r.onlyMine || r.pairGuess) ? ' ywpu-newrow' : ''}${sel}${dim}" data-side="${side}" data-ident="${esc(r.identifier)}"${key ? ` data-key="${esc(key)}"` : ''}>
        <span class="ywpu-onum">${r.index}</span>${grab}<span class="ywpu-oname">${esc(r.name)}</span>${flag}${noBadge}${movedFrom}${mk}
    </div>`;
}

function defaultNewName() {
    const base = S.nextName && !/^（/.test(S.nextName) ? S.nextName : (getSettings().lastMineName || '预设');
    return String(base).replace(/\.json$/i, '') + '-我的';
}

function renderFoot() {
    const host = $el('#ywpu-foot');
    if (!host) return;
    if (!S.analysis) { host.innerHTML = ''; return; }
    // ★以界面上那个输入框为准（不管是谁改的：手打 / 脚本赋值）——名字绝不能被重绘冲掉
    const nameEl = ('#ywpu-name');
    if (nameEl && nameEl.value) S.newName = nameEl.value;
    // ★用户正在输入名字 → 只就地更新计数，不重建底栏（否则名字被冲掉、焦点也丢）
    const typingName = document.activeElement && document.activeElement.id === 'ywpu-name';
    if (typingName && host.querySelector('#ywpu-name')) {
        const p = PM.pendingCount(S.analysis.items, S.decisions);
        const chip = host.querySelector('.ywpu-chip');
        if (chip) { chip.className = 'ywpu-chip ' + (p ? 'ywpu-c-decide' : 'ywpu-c-same'); chip.innerHTML = p ? ('还剩 <b>' + p + '</b> 条要处理') : '✓ 全部处理完了'; }
        return;
    }
    const pending = PM.pendingCount(S.analysis.items, S.decisions);
    /* ★Wave K1（2026-09-24 · 作者第 19 批第 5 条）当时这里：只要还有「要你看」没处理完 ⇒ **两颗写盘按钮默认禁用**
       （"一眼看见还进不了下一步"）。判定用的是内核同一支 `pendingCount`（"两条都留 / 逐处挑 / 还原旧状态"
       这些**都算处理完**，见内核 `itemDecided()`）。
       ★★W29（2026-09-25 · 作者拍板走"甲"）：**这一层禁用放开了**。作者给的理由是根因级的：
         浏览器**不给 `disabled` 的按钮派发 click** ⇒ 他自己点名的那个场景
         （"有些用户可能只想缝其中一个条目 只选择了它 → 点生成 → 弹提醒框"）**主路上根本走不到**
         （放开前只剩 `#ywpu-name` 里按回车、以及脚本接口 `__ywpu.generate()` 两条偏门路能到）
         ⇒ 那条需求等于没落地。**放开后**：有待处理时按钮照旧可点，点下去由
         `doGenerate()` / `stitchIntoCurrent()` 里那道 `askPendingAnyway()` 确认框接着说
         （"继续生成 / 继续缝入" = 照原流程走；"回去挑" = 一个字都不写盘 + 跳回第一条没处理的）。
       ★**只放开了"未处理完"这一个原因**（逐颗读数列在报告 §1）：预览（`pv`）照旧禁用；
         `#ywpu-stitch` 的"① 不是酒馆里装的那份预设"（`canStitch === false`）也照旧禁用。
       ★"还剩 N 条"现在由**左边那颗胶囊**（它自己可点，会跳到第一条没处理的）+ **行尾标记**
         （`rowMark` 的「挑到一半（还差 N 处）」/「点我处理」）撑着，不再靠按钮灰着提示。 */
    const blocked = pending > 0;          // ★W29 起：只用来决定**按钮 title 怎么写**，不再决定 disabled
    const blockedTip = '还有 ' + pending + ' 条要你看没处理完 —— 点下去会先弹一句确认'
        + '（没处理的按老规矩兜底：跟新版；只有我有的那几条保留）。'
        + '想先处理就点左边那颗「还剩 ' + pending + ' 条要处理」（会跳到第一条没处理的）。';
    const dec = Object.values(S.decisions);
    const cnt = {
        next: dec.filter(d => d.source === 'next').length,
        mine: dec.filter(d => d.source === 'mine').length,
        both: dec.filter(d => d.source === 'both').length,
        custom: dec.filter(d => d.source === 'custom').length,
    };
    // ★「缝入当前预设」（§18）：只有 ① 是"酒馆里已安装的那份预设"时才写得回去（文件来源没有落点）
    const stitchName = String(S.mineName || '');
    const canStitch = !!(S.mine && stitchName && S.mineFrom === 'preset' && listPresetNames().includes(stitchName));
    // ★B12：备份默认不勾；★S1-2 起这个勾选框**搬进了确认框**（底栏不再占一行）—— 底栏只留一句"默认不备份"的风险角标
    const bak = !!S.stitchBackup;
    const stitchTip = canStitch
        ? ('把这次的结果直接写进 ' + stitchName + '（= ①，你现在在用的那份）。点下去会先弹确认框：' +
            '框里能勾「同时自动备份」—— 勾了就先把原文另存成 ' + stitchBackupName(stitchName, listPresetNames()) + ' 再覆盖；' +
            (bak ? '（你上次勾了备份）' : '不勾就直接覆盖、没有副本可退。'))
        : '① 现在不是"酒馆里在装的预设"（是从文件读的，或那份被改名/删了）—— 这条写不回去，用左边的「生成新预设」另存一份。';
    const pv = !!S.preview;                               // ★M11：伪缝入（预览）—— 写盘按钮全部失效并标「（预览）」
    const pvTip = '预览（伪缝入）：看得到对比结果，但这里的按钮都不会写盘';
    /* ★S2-2（UI R1-2 + 文案 §C9）：状态区**收成一行**。
       原来这里是 4 个块（…条要处理 / 上一条·下一条 / 三方两方对比 / 顺序 / 四格计数）→ 手机上折成 2~3 行；
       现在「三方两方 + 顺序 + 四格计数」并成**一句小字**（`title` 里放全文），窄屏靠 ellipsis 收，
       绝不换行（→ 底栏在手机档（原来 240px 那档）省下 1~2 行）。 */
    /* ★Wave B2：底栏那句"三方/两方"由**带锁的三状态**说了算（判不了就说实话，别写"建议补③"——
       手选控件就在**同一行**那颗 `⚠ 选基准` 药丸里，点开就是）。总开关关掉时退回旧文案一个字不变。 */
    const lockOn = getSettings().baseLock !== false;
    const lockLine = lockOn ? lockBarHtml() : '';
    const statLine = ((lockOn && S.lock) ? (S.lock.state === 'lit' ? '三方对比' : '两方对比') : (S.analysis.stats.threeWay ? '三方对比' : '两方对比（判断不了谁改的）'))
        + ' · ' + (S.analysis.stats.orderMoved ? ('顺序：' + S.analysis.stats.orderMoved + ' 条被挪了位置') : '顺序：没条目被挪动')
        + ' · 用新版 ' + cnt.next + ' ｜ 用我的 ' + cnt.mine + ' ｜ 保存为两版 ' + cnt.both + ' ｜ 逐处挑 ' + cnt.custom
        + (((lockOn && S.lock) ? (S.lock.capsule || '') : (S.analysis.stats.threeWay ? '' : '（建议补 ③ 官方旧版）')));
    /* ★★AU4 ④（评审 §2 条 5 · 底栏瘦身，**改的是位置不是内容**）：三条一起
       ① **危险提示并进动作行**（贴着它说的那两颗按钮）：改前它自己占一整行（手机 17px）。
          文字一个字没改（`⚠ 覆盖①… · 默认不备份` + 同一个 title 前缀），只把容器从"自己的 `.ywpu-footline`"
          改成"动作行里的一个可缩 item"（CSS：`flex: 0 1 auto; min-width: 0` + ellipsis ⇒ 窄屏**缩省略**、
          不换行 ⇒ 行高不涨）。
          ★**Wave W8（2026-09-24 · 作者第 21 批 §FE-C1："有点多余 删掉"）：那颗角标（`.ywpu-stitchnote`）
            整个删掉了** ⇒ 现在的动作行只剩「名字 + 两颗按钮 + ⬆…」；"默认不备份"由按钮 title +
            确认框正文 + 缝完的 toast 三处接着说（见下面 `ywpu-footacts` 那段注释里的逐处清单）。
       ② **「离线 / 高级」折进一颗「…」**（同一个 `<details id="ywpu-adv">` + 同一个 `#ywpu-export-patch`）：
          改前那一行 summary 自己占 19px；现在它在动作行里，展开的正文**浮在它上面**（`.ywpu-adv-body`
          绝对定位，见 CSS）⇒ 行高不涨。`r9h` 读的 `#ywpu-adv.open`、`shots-store-ui` 的开合照旧可用。
       ③ 第 1 行「还剩 N 条要处理 / 上一条 / 下一条 / 状态句」**同排**（CSS：手机档那条
          `.ywpu-footstat { flex: 1 1 100% }` 改成 `flex: 1 1 auto; min-width: 0`，状态句缩省略不换行）。
       手机档目标：底栏 209px（24.8%）→ **≈93px（11%）**；PC 档 130.7px → ≈80px。 */
    /* ★Wave K1（2026-09-24 · 作者第 19 批第 5/6 条）：
       ① 「还剩 N 条」**一眼能看见**（`ywpu-todo`：强调色底 + 加粗计数 —— ★**不用**危险色那一族的红：
          `--yst-warn` 是"还没处理"那一族的红（全界面唯一的红专给"要管"的条目），作者点名别拿它当强调色，
          对比度读数见 `e2e/tmp/waveK1-*.log` 的 ②b 段）；
       ② 这颗胶囊**自己就是"一键跳到第一条未选"**（点它 = 滚到第一条还没处理的条目 + 高亮它）——
          同一个位置、零新增宽度（底栏行数一个都不涨，手机档 137px 的 KPI 不受影响）。
          ★为什么不再加一颗独立按钮：底栏第一行是"多一行就多 17px（手机）"的硬指标区，
          而更新器里"胶囊可点"本来就是这个界面的既有语言（筛选 chips / 正则 chip 都是点自己生效）。 */
    const pendingTip = '点这里跳到第一条还没处理的条目（会滚到它、把它高亮）';
    host.innerHTML = `
<div class="ywpu-footline">
    ${pending
            ? `<button class="ywpu-chip ywpu-todo" id="ywpu-goto-first" title="${esc(pendingTip)}">还剩 <b>${pending}</b> 条要处理</button>
               <button class="ywpu-btn ywpu-mini" id="ywpu-jump-prev">上一条</button>
               <button class="ywpu-btn ywpu-mini" id="ywpu-jump-next">下一条</button>`
            : `<span class="ywpu-chip ywpu-c-same">✓ 全部处理完了</span>`}
    <span class="ywpu-note ywpu-footstat" title="${esc(statLine)}">${esc(statLine)}</span>
    <details class="ywpu-adv" id="ywpu-adv">
        <summary title="离线 / 高级（导出更新包等）">…</summary>
        <div class="ywpu-adv-body">
            <button class="ywpu-btn ywpu-mini" id="ywpu-export-patch" title="作者用：把「① 你的预设（上一版原版）→ ② 新版预设」之间改了/加了/删了的地方做成一个小文件（.json）发给用你预设的人 —— 不打包整份预设"${(S.mine && S.next) ? '' : ' disabled'}>⬆ 导出更新包</button>
            <span class="ywpu-note">作者侧：导出 ①→② 的差量小文件（离线兜底，平时用不到）</span>
        </div>
    </details>
    ${lockLine}
</div>
<div class="ywpu-footline ywpu-footacts">
    <input class="ywpu-input ywpu-namein" id="ywpu-name" value="${esc(S.newName || defaultNewName())}" title="新预设的名字">
    <span class="ywpu-footbtns">
        <span class="ywpu-btngroup">
            <button class="ywpu-btn ywpu-primary" id="ywpu-generate"${pv ? ' disabled' : ''} title="${esc(pv ? pvTip : (blocked ? blockedTip : '另存成一份新预设（你原来那份一个字不动）'))}">生成新预设${pv ? '（预览）' : ''}</button>
            <button class="ywpu-btn ywpu-stitch" id="ywpu-stitch"${(canStitch && !pv) ? '' : ' disabled'} title="${esc(pv ? pvTip : (canStitch ? (blocked ? blockedTip + ' ' + stitchTip : stitchTip) : stitchTip))}">缝入当前预设${pv ? '（预览）' : ''}</button>
        </span>
    </span>
    ${/* ★Wave W8（2026-09-24 · 作者第 21 批 §FE-C1：「有点多余 删掉」）：
        这里原来是底栏动作行尾那颗风险角标「⚠ 覆盖①「X」 · 默认不备份」（条件 canStitch && !pv && !bak）。
        **整块删掉**（作者要求），改前 → 改后：那一句在页面上 0 命中（.ywpu-stitchnote 节点 = 0）。
        ★"默认不备份"这个事实**一处都没少**（删前删后都在，共 3 处，都是可见文字、不是只挂 hover）：
          ① 「缝入当前预设」按钮的 title（stitchTip）里那句「不勾就直接覆盖、没有副本可退。」（本文件 renderFoot 里）；
          ② **确认框正文**（stitchIntoCurrent 的 askYesX lines）：「· 不勾（默认）= 不备份 → 直接改 X，改坏了没有副本可退。」；
          ③ 缝完之后那条 toast：「已直接改 X，没有备份。（下次想留一份退路…）」。
        ★保留 .ywpu-stitchnote 的 CSS 两条规则（不留孤儿：老截图/老断言引到也能找到，同 Wave W2 ③ 的处理）。
        ★底栏读数（四档实测）：PC 82px / 手机 137px —— 与删前**逐像素相同**（那条角标在动作行里是
        flex: 0 1 auto + ellipsis，删掉只是少一个可缩 item，行高不变）。
        ★本注释住在模板字面量里面：**一个反引号都不许出现**（否则会提前结束模板 —— 本文件踩过的坑）。 */''}
</div>
${pv ? `<div class="ywpu-footline"><span class="ywpu-prevnote">👁 ${esc(pvTip)}</span></div>` : ''}`;
    /* ★Wave K1：**"还没处理的条目"按预设顺序排好**（"上一条 / 下一条"与那颗「还剩 N 条」共用同一支 ——
       口径只有一份，不许各写一份：判定 = 内核 `needsChoice && !itemDecided`，顺序 = 预设里的位置）。
       ★两种"已处理"都算处理完（内核 `itemDecided` 说了算）：① 点过「两条都留 / 逐处挑 / 用我的 / 用新版」；
       ② "只有开关不同"那种点过「还原旧状态 / 保持新状态」。所以这里不会把已挑好的条又算成待处理。 */
    const pendingItemsInOrder = () => {
        const posOf = (k) => (S.posMap ? (S.posMap.get(k) ?? 1e6) : 0);
        return S.analysis.items.filter(it => PM.needsChoice(it) && !PM.itemDecided(it, decOf(it)))
            .sort((a, b) => posOf(a.key) - posOf(b.key));
    };
    // 上一条 / 下一条：在"还没处理的条目"里前后跳（★v4.0 修 BUG：以前永远跳到"第一条待处理"，
    // 所以当你正停在第一条待处理上、或者只是展开看过一条时，点它看起来"不跳"）
    const jump = (dir) => {
        const posOf = (k) => (S.posMap ? (S.posMap.get(k) ?? 1e6) : 0);
        const list = pendingItemsInOrder();
        if (!list.length) { toast('success', '没有待处理的条目了'); return; }
        const cur = S.curKey && S.analysis.items.some(it => it.key === S.curKey) ? S.curKey : null;
        let target = null;
        if (!cur) target = dir > 0 ? list[0] : list[list.length - 1];
        else {
            const p = posOf(cur);
            const after = list.filter(it => posOf(it.key) > p);
            const before = list.filter(it => posOf(it.key) < p);
            target = dir > 0
                ? (after[0] || list[0])                     // 后面没有了 → 绕回第一条（看得见反馈，不是"没反应"）
                : (before.length ? before[before.length - 1] : list[list.length - 1]);
        }
        S.filter = 'all';
        focusItem(target.key);
        toast('info', (dir > 0 ? '下一条：' : '上一条：') + (target.next?.name || target.mine?.name || ''));
    };
    $el('#ywpu-jump-next')?.addEventListener('click', () => jump(1));
    $el('#ywpu-jump-prev')?.addEventListener('click', () => jump(-1));
    /* ★Wave K1（作者第 19 批第 5 条）：那颗「还剩 N 条要处理」胶囊 = **一键跳到第一条未选**。
       与「下一条」的区别（作者要的就是"第一条"）：**不看你现在停在哪一条**，一律回到最上面那条还没处理的；
       并且先把筛选切到「点我处理」（= 未处理的那些），保证那一条**真的在列表里**（被筛掉的话滚不过去）。 */
    $el('#ywpu-goto-first')?.addEventListener('click', () => {
        const list = pendingItemsInOrder();
        if (!list.length) { toast('success', '没有待处理的条目了'); renderFoot(); return; }
        S.filter = 'pending';
        renderResult();
        focusItem(list[0].key);
        toast('info', '第一条还没处理的：' + (list[0].next?.name || list[0].mine?.name || '') + '（还有 ' + list.length + ' 条）');
    });
    $el('#ywpu-generate').addEventListener('click', () => doGenerate());
    $el('#ywpu-stitch')?.addEventListener('click', () => stitchIntoCurrent());   // ★§18：缝入当前预设（B12：勾了备份才备份）
    /* ★S1-2：底栏那颗「同时自动备份」勾选框**已经搬进确认框**（`stitchIntoCurrent` 的 askYesX extraHtml）——
       底栏不再绑它、也不再占一行。默认不备份的口径一个字没变（B12），只是"要不要退路"这一下现在
       和"确定要覆盖"发生在**同一次交互**里（人性化 §A③）。 */
    $el('#ywpu-export-patch')?.addEventListener('click', () => exportPatch());
    /* ★Wave B2：基准提示条上的三颗交互（下拉 / ［V0824］ / 选文件…）—— 每次都重画，所以每次都重绑 */
    if (typeof bindLockBar === 'function') bindLockBar(host);
    $el('#ywpu-name').addEventListener('input', function () { S.newName = this.value; });
    $el('#ywpu-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doGenerate(); });
}

/* ================================================================ ★W29（作者 2026-09-25 拍板）：「没处理完」从"拦阻"改成"确认"
   作者原话："**要** 因为有些用户可能只想缝其中一个条目 只选择了它 所以如果没选完 弹出一个提醒框让用户确认"。
   改前（Wave K1 + W19A-3 之后的形态）：`pendingCount > 0` ⇒ 生成 / 缝入**直接拦掉**（toast + 一个字不写）。
   改后：**先问一句** —— 点「继续生成 / 继续缝入」就照原流程走（内核那套兜底），点「回去挑」就一个字都不写。
   ★ 内核判据**一个字不改**：逐处挑的中间态照旧算"待处理"、行尾照旧显示「挑到一半（还差 N 处）」、
     `pendingCount` /「待我处理」筛选 / 底栏读数**全部不变**。
   ★ 两档未处理的**真实后果**是实测出来的，不是猜的（`e2e/tmp/w29-probe-halfpick-fate.js` 逐字读数）：
     · 完全没选 ⇒ 走内核 `fallbackDecision()` 兜底：两边都有的**跟新版**、只有我有的**保留**、开关那档**跟新版**；
     · 挑到一半 ⇒ 内核写的是 `dec.customText`（用户在界面里每挑一处都会重算它）
       ⇒ **你挑过的处保留、没点的那几处按新版**。
       ⚠ 不是"已挑的会丢" —— "整条退回新版"只发生在 `customText` 为空的那种边界形状上（0 处被挑）。 */

/** 「没处理完」的分档（★W29 确认框要用它说清后果；判据全部来自内核，UI 侧不新造第二套）
 *  判据 = 内核 `needsChoice` + `itemDecided`，与「待我处理」筛选、底栏那句「还剩 N 条」、
 *  行尾「挑到一半（还差 N 处）」**同源**；`left` 走 UI `decideProgress()`（与内核 `pickProgress()` 逐字段同值）。
 *  @returns {{total:number, half:number, halfLeft:number, plain:number}} */
function pendingForWrite() {
    const out = { total: 0, half: 0, halfLeft: 0, plain: 0 };
    if (!S.analysis) return out;
    for (const it of S.analysis.items) {
        if (!PM.needsChoice(it)) continue;
        const d = S.decisions[it.key] || {};
        if (PM.itemDecided(it, d)) continue;
        out.total++;
        if (d.source === 'custom' && it.mine && it.next) {
            const pg = decideProgress(it, d);
            if (pg.left > 0) { out.half++; out.halfLeft += pg.left; continue; }
        }
        out.plain++;
    }
    return out;
}

/** 点「回去挑」：跳回第一条还没处理的条目 —— **就是改前那道拦阻里原有的动作，原样保留**
 *  （按钮叫"回去挑"就得真回去；★不写盘、不改决策表，只动视图：筛选档 + 滚过去 + 一句 toast）。 */
function gotoFirstPending(msg) {
    S.filter = 'pending';
    renderResult();
    if (msg) toast('info', msg);
    setTimeout(() => { const f = $el('#ywpu-list .ywpu-item'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);
}

/** 没处理完时的那一句确认（生成 / 缝入**共用一份文案**，只有动词不同 —— 两条路后果同源，别各写一份）
 *  @param {string} verb 用户正要点的那颗按钮的动作词（'生成' / '缝入'）
 *  @returns {Promise<boolean>} true = 继续走原流程；false = 用户选了「回去挑」 */
async function askPendingAnyway(verb) {
    const p = pendingForWrite();
    return await askYes('还有 ' + p.total + ' 条没处理完', [
        '还有 ' + p.total + ' 条没处理完' + (p.half ? '（其中 ' + p.half + ' 条只挑到一半）' : '') + '。',
        p.plain ? '没选的那些按老规矩兜底：跟新版（只有我有的那几条保留下来）。' : '',
        p.half ? ('那 ' + p.half + ' 条只挑到一半的：**你挑过的地方保留**，没点的 ' + p.halfLeft + ' 处按新版写进去。') : '',
    ], { ok: '继续' + verb, cancel: '回去挑' });
}

async function doGenerate() {
    if (S.busy) return;
    // ★M11（跨批契约）：预览（伪缝入）模式 —— **绝不写盘**（按钮已 disabled，这里再兜一道，脚本/接口也绕不过去）
    if (S.preview) { toast('info', '这是预览（伪缝入）：不会真的写盘。想真缝就到商店卡片上点「缝入」'); return; }
    /* ★W19A ①：**写盘前的同一族防线**（与 stitchIntoCurrent 同一句判据）—— ① 那份预设如果在开对比之后
       又被改过，生成出来的新预设会**缺掉他刚改的那些**（另存新名不覆盖原文件，但"看着像没改过"同样是坑）。
       先拦、先按最新内容重算，让他看一眼再点。 */
    if (mineChangedSinceAnalysis()) return;
    /* ★W29（作者 2026-09-25 拍板，走"甲"）：**没处理完 = 问一句，不再直接拦**。
       改前这里读 `PM.pendingCount(...) > 0` 就 toast + `return`（"点不动"）；
       现在改成弹确认框：点「继续生成」照原流程走（内核兜底），点「回去挑」跳回第一条没处理的、一个字不写。
       ★底栏那两颗按钮的 `disabled` **同批一起放开了**（`renderFoot` 的 `blocked` 现在只写 title）
         —— 不放开的根因是：浏览器不给 `disabled` 按钮派发 click ⇒ 这个确认框在主路上永远弹不出来。 */
    if (pendingForWrite().total > 0) {
        if (!await askPendingAnyway('生成')) { gotoFirstPending('好，这次不生成 —— 没处理完的那些还在等你'); return; }
    }
    const typed = (($el('#ywpu-name')?.value || S.newName || '') + '').trim();
    if (!typed) { toast('warning', '给新预设起个名字'); return; }
    // ★P7（§15）：从商店来的这条路**绝不覆盖同名** —— 撞名自动加（2）（3）…（跟 P1/P6 的另存新名同一个口径）。
    //   别的路仍是老规矩（撞名问一句 + 覆盖前备份），一个字没动。
    const names = listPresetNames();
    let name = typed;
    if (S.store) { let n = 2; while (names.includes(name)) { name = typed + '（' + n + '）'; n++; } }
    S.newName = name;
    const exists = names.includes(name);
    // ★S1-2：原来是 window.confirm（可能被浏览器静默拦下 → 点了没反应）→ 走酒馆原生弹窗
    if (!S.store && exists) {
        const goOver = await askYes('已经有一个同名的预设了', [
            '已经有一个叫「' + name + '」的预设了。',
            '继续会覆盖它（你现在正在用的那份不会被动）。',
            '覆盖前会自动把它的备份 JSON 下到你的下载目录。',
        ], { ok: '覆盖它', cancel: '算了' });
        if (!goOver) { toast('info', '好，这次不生成 —— 那个同名的预设一个字都没动'); return; }
    }

    try {
        S.busy = true;
        const params = Object.entries(S.params).map(([key, use]) => ({ key, use }));
        // ★§22：顺序用**顺序页看到的那一份**（orderRowsNow：内核顺序 → 位置待定提到最前 → 你手动拖过的顺序）
        const ord = orderOverrideForBuild();
        const { preset, report } = PM.buildMerged({
            mine: S.mine, next: S.next, items: S.analysis.items,
            decisions: S.decisions, params, orderMode: S.orderMode,
            orderOverride: ord.override,
            extraEntries: extras(),
            regex: regexArgForBuild(),          // ★R8：预设级正则（没有正则时是 null → 老行为一个字不变）
        });
        const sum = PM.summarizeMerge(preset, S.next, S.mine);

        const lines = [
            '将生成新预设：「' + name + '」' + (S.store && name !== typed ? '\n（本来叫「' + typed + '」，已经有同名的了 —— 商店这条路不覆盖任何同名，所以给你换个名字）' : ''),
            '',
            /* ★★D2：**界面口径 = 可见条目数**（内核 `summarizeMerge().visible*`，与对比页/商店**同一个判据**）。
               改前印的是 `prompts` 全量（含 ST 里隐藏的幽灵 —— 他这份 22 条）⇒ 数字比列表里多几十条，看着像"多出来一堆"。 */
            '· 条目数：' + sum.visibleEntryCount + '（你 ' + sum.visibleMineEntryCount + ' / 新版 ' + sum.visibleNextEntryCount + '）',
            '· 顺序表：' + sum.orderCount + ' 条，其中开启 ' + sum.enabledCount + '（新版原本开启 ' + sum.nextEnabledCount + '）',
            ord.pinned.size ? '· 位置待定 ' + ord.pinned.size + ' 条（在你这份里找不到该插在哪）：已经放在顺序表最上面' : '',
            '· 用新版 ' + report.replaced.length + ' 条；保留你的 ' + report.keptMine.length + ' 条；合成一条 ' + report.spliced.length + ' 条',
            report.addedFromMine.length ? '· 把你独有的 ' + report.addedFromMine.length + ' 条加进来：' + report.addedFromMine.slice(0, 6).join('、') + (report.addedFromMine.length > 6 ? '…' : '') : '',
            extras().length ? '· 你自己新建/复制的 ' + extras().length + ' 条也会写进去' : '',
            report.dropped.length ? '· 被你放弃的：' + report.dropped.slice(0, 6).join('、') : '',
            // ★R8：正则（只在真有正则改动时出现一行，不啰嗦）
            (report.regex && !report.regex.error)
                ? ('· 正则：' + PM.getRegexList(preset).length + ' 条'
                    + (report.regex.summary.keep ? '（保你的 ' + report.regex.summary.keep + '）' : '')
                    + (report.regex.summary.add ? '（新增 ' + report.regex.summary.add + '）' : '')
                    + (report.regex.pendingRemove.length ? '（作者删了的 ' + report.regex.pendingRemove.length + ' 条**先留着**）' : ''))
                : '',
            // ★安全评审 ②③：保留/冲突的顶层字段说一句（一行，不加说明文字）
            report.topFields
                ? ('· 顶层字段：保留了 ' + (report.topFields.carried.length + report.topFields.containerCarried.length) + ' 个'
                    + '（其中 ' + report.topFields.conflicts.length + ' 个两边不同→跟新版）')
                : '',
            '',
            '你原来的预设不会被改动。',
        ].filter(Boolean);
        // ★S1-2：window.confirm → 酒馆原生弹窗；取消时**补一句 toast**（绝不静默）
        if (!await askYes('生成新预设', lines, { ok: '生成', cancel: '算了' })) {
            S.busy = false;
            toast('info', '好，这次不生成 —— 你原来的预设一个字都没动');
            return;
        }

        // 只有"要覆盖掉一个已存在的预设"时才自动备份：其余情况我们从不动任何已有预设，备份是噪音
        if (exists) {
            try {
                const old = readPreset(name);
                if (downloadJson(name + '.覆盖前备份-' + nowStamp() + '.json', old)) toast('info', '已把被覆盖的「' + name + '」备份到下载目录');
            } catch (e) { /* 读不到就算了，继续生成 */ }
        }

        await savePreset(name, preset);
        S.extraEntries = [];          // 已经写进新预设了，清掉避免下次重复缝
        S.selIdents = []; S.orderVisibleIds = null;    // ★W9-5：选择清了 ⇒ "看得见的那份"一起作废（下次渲染重算）
        S.lastSaved = name;
        /* ★S1-5（人性化 D5）：老文案写"到 设置 → 对话补全 的预设下拉里选它即可"是**错的** ——
           ST 保存之后 `preset-manager.js` 的 `updateList()` 会**当场把当前预设切到刚存的那份**
           （两个分支都 `$(this.select).val(...).trigger('change')`）。让用户去下拉里找一份"已经被选中"的预设，
           他会找不到、然后怀疑没生效。这里按**实测**说（savedWhereText）：
           switched = 已经切过去了 / not = 如实让他去选 / unknown = 说保守话。 */
        toast('success', '已生成「' + name + '」——' + savedWhereText(name, '（你原来那份没动，还在下拉里）'));
        // ★P7（§15）：商店来的这次缝，写盘成功后回商店记账（"已缝入"标记 + 服务端 sews 计数 + 提示"你缝过的这条变了"）。
        //   商店模块没加载起来（发布隔离）→ 静默跳过，只留痕：预设已经写好了，不能因为记账失败就报错。
        notifyStoreStitched(name);
        S.store = null;              // 这一次商店的会话结束了（下次点卡片再建）
        // ★F2：商店「一键更新全部」带过来的一批 → 写盘成功后**自动带出下一张**（没有批量就照常关窗）
        const advanced = storeBatchAdvance('这一张已经写好了：' + name);
        if (!advanced) closeWindow();
        renderSource();
    } catch (e) {
        toast('error', '生成失败：' + (e?.message || e));
        console.warn('[预设更新器] 生成失败', e);
    } finally {
        S.busy = false;
    }
}

/** ★P7：写盘成功后回商店记账（生成 / 缝入当前预设**两条路共用**，一个字不差）。 */
function notifyStoreStitched(name) {
    if (!S.store) return;
    try {
        const sp = (typeof window !== 'undefined') ? window.__ywStoreApi : null;
        if (sp && typeof sp.stitched === 'function') sp.stitched(S.store.cardId, name);
        else console.warn('[预设更新器] 商店模块没加载起来 → 这次没回商店记账（预设已写好，不影响）');
    } catch (e) { console.warn('[预设更新器] 回商店记账失败（预设已写好，不影响）', e); }
}

// ================================================================ 「缝入当前预设」（§18 · 2026-09-20 用户要求）
//  用户原话："加一个「缝入当前预设」……把当前对比出来的结果**直接写进"你当前在用的那份预设"**（不是另存新名）。"
//  铁律（本项目的红线）：**绝不无备份地覆盖用户文件** —— 顺序必须是"先备份（读原文另存一份）→ 确认备份真在 → 才覆盖主文件"。
//  备份名：`<原名>（缝入前备份 YYYY-MM-DD）`，撞名加序号（2）（3）…（跟"另存新名"同一个口径，绝不覆盖任何同名）。
//  ★下面两个函数是**纯逻辑 + 注入 IO**（不碰 DOM / 不 import 任何东西）：
//    e2e/tmp/probe-stitch-current.js 按 ywpu-stitch-core 标记把这段抽出来，在纯 Node 里直接调（可以真写盘）。

/* ==== ywpu-stitch-core:start（纯逻辑，别在这段里引用外面的东西 —— 探针会把这段单独抽出来跑）==== */
/** 备份名：`<原名>（缝入前备份 YYYY-MM-DD）`；撞名加（2）（3）…。today 不给就用今天。 */
function stitchBackupName(name, names, today) {
    const base = String(name || '').replace(/\.json$/i, '').trim();
    const d = today ? new Date(today) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    const root = base + '（缝入前备份 ' + day + '）';
    const list = Array.isArray(names) ? names : [];
    let out = root, n = 2;
    while (list.includes(out)) { out = root + '（' + n + '）'; n++; }
    return out;
}

/** 写盘核心：**读原文 → （勾了才）备份 → 再覆盖**（任何一步不成就一个字都不写）。
 *  ★B12（作者 2026-09-21）：**备份变成用户勾了才做** —— 原话"只缝一条就多一份预设，会泛滥"。
 *    · `o.backup === true` → 老行为：先备份一份〈原名（缝入前备份 YYYY-MM-DD）〉，**确认备份真在盘上**，才覆盖主文件；
 *    · 不给 / false（默认）→ **不备份，直接覆盖** —— 但**一个字都不写**的红线一条不减：
 *      读不到原文 → 不写；写失败 → 报错（不假称成功）；**备份那一路的所有失败分支也一个字都不写**。
 *  @param {{name:string, merged:object, backup?:boolean, today?:any,
 *           io:{list?:Function, read:Function, save:Function, has?:Function}}} o
 *  @returns {Promise<{ok:boolean, why?:string, backupName?:string, backedUp?:boolean, wrote?:boolean, entries?:number}>} */
async function stitchWrite(o) {
    const name = String((o && o.name) || '').replace(/\.json$/i, '').trim();
    const merged = o && o.merged;
    const io = (o && o.io) || {};
    const wantBackup = !!(o && o.backup === true);        // ★B12：默认不备份（只有显式 true 才备份）
    const list = () => { try { return (typeof io.list === 'function' ? io.list() : []) || []; } catch (e) { return []; } };
    if (!name) return { ok: false, why: '没有"你正在用的那份预设"的名字' };
    if (!merged || typeof merged !== 'object' || !Array.isArray(merged.prompts)) return { ok: false, why: '要写进去的内容不完整（没有 prompts）' };
    if (typeof io.read !== 'function' || typeof io.save !== 'function') return { ok: false, why: '写盘接口不齐（缺 read / save）' };

    const names = list();
    const backupName = stitchBackupName(name, names, o && o.today);

    // ① 先把原文读出来（读不到就绝不往下走：没有原文就不知道会不会写坏东西）
    let original = null;
    try { original = io.read(name); } catch (e) { return { ok: false, why: '读不到 ' + name + '的原文（' + ((e && e.message) || e) + '）—— 一个字都没写' }; }
    if (!original || typeof original !== 'object') return { ok: false, why: '读不到 ' + name + '的原文 —— 一个字都没写' };

    // ② 勾了「同时自动备份」才备份：另存一份（新名字，绝不覆盖谁）
    if (wantBackup) {
        try { await io.save(backupName, original); }
        catch (e) { return { ok: false, why: '备份没写成功（' + ((e && e.message) || e) + '）—— 一个字都没写' }; }
        // ③ 确认备份真的在（有 has 钩子就用；ST 的预设列表当场就能看到它）
        if (typeof io.has === 'function') {
            let there = false;
            try { there = !!io.has(backupName); } catch (e) { there = false; }
            if (!there) return { ok: false, why: '备份 ' + backupName + '没落到盘上 —— 一个字都没写', backupName };
        }
    }

    // ④ 备份在了（或用户选了不备份），才覆盖主文件
    try { await io.save(name, merged); }
    catch (e) {
        return {
            ok: false, backupName: wantBackup ? backupName : '', backedUp: wantBackup,
            why: '写 ' + name + '没成功（' + ((e && e.message) || e) + '）—— 没写进去'
                + (wantBackup ? '（你勾的备份 ' + backupName + '已经在了，想退回原样就选它）' : '（这次没勾备份）'),
        };
    }
    return { ok: true, backupName: wantBackup ? backupName : '', backedUp: wantBackup, wrote: true, entries: (merged.prompts || []).length };
}
/* ==== ywpu-stitch-core:end ==== */

/** 界面入口（底栏「缝入当前预设」）：确认 →（勾了才备份）→ 覆盖 ① 那份预设
 *  与「生成新预设」共用同一条拼装路（PM.buildMerged），只是最后写盘的名字不同：**同名覆盖**而不是另存新名。
 *  ★B12（作者 2026-09-21）：**默认不备份** —— 勾了才"先备份再覆盖"，
 *    不勾就**直接覆盖**（成功提示必须说清"已直接改〈X〉，没有备份"，不能让人以为还有一份退路）。
 *  ★S1-2（R9）：那个「同时自动备份」勾选框从**底栏搬进确认框本体**（人性化 §A③ 的改法：
 *    "退路开关要和危险动作在同一次交互里"）。底栏那颗已经删掉，底栏因此也少一行。
 *    —— 用户看到的：一眼看清后果（覆盖原文件 / 没有副本可退）+ 当场就能勾上退路，点「确定」就走。 */
async function stitchIntoCurrent() {
    if (S.busy) return;
    if (S.preview) { toast('info', '这是预览（伪缝入）：不会真的写盘。想真缝就到商店卡片上点「缝入」'); return; }   // ★M11：预览模式绝不写盘
    if (!S.analysis) { toast('warning', '先点「开始对比」'); return; }
    /* ★W19A ①：**写盘前的同一族防线** —— ① 那份预设如果在开对比之后又被改过（用户在酒馆里改的），
       这一缝就是拿旧快照去**覆盖原文件** ⇒ 他刚改的那些会被悄悄吃掉。所以先拦、先重算、先让他看一眼。 */
    if (mineChangedSinceAnalysis()) return;
    /* ★W29（作者 2026-09-25 拍板）：与「生成新预设」**同一句判据、同一份文案**（只有动词不同）——
       这里从"拦掉"改成"问一句"。点「回去挑」不写盘；点「继续缝入」才往下走（下面还有那道覆盖确认）。 */
    if (pendingForWrite().total > 0) {
        if (!await askPendingAnyway('缝入')) { gotoFirstPending('好，这次不缝 —— 没处理完的那些还在等你'); return; }
    }
    const name = String(S.mineName || '').replace(/\.json$/i, '').trim();
    if (!S.mine || !name) { toast('warning', '① 还没选预设 —— 先在上面选你现在在用的那份'); return; }
    if (S.mineFrom !== 'preset') { toast('warning', '① ' + name + '是从文件读的，酒馆里没有这一份 —— 这条写不回去，用「生成新预设」另存一份吧'); return; }
    if (!listPresetNames().includes(name)) { toast('warning', '酒馆里找不到 ' + name + '了（可能被改名/删了）—— 到「① 你的预设」重新选一份'); return; }

    const wantBackup = !!S.stitchBackup;                  // ★B12：勾了才备份（默认不勾）
    const backupName = stitchBackupName(name, listPresetNames());
    const cur = (() => { try { const pm = presetManager(); return pm && typeof pm.getSelectedPresetName === 'function' ? String(pm.getSelectedPresetName() || '') : ''; } catch (e) { return ''; } })();
    // ★§22：顺序跟「生成新预设」**同一份**（位置待定在最上面 / 你手动拖过的顺序）—— 先算出来，确认框里如实写
    const ord = orderOverrideForBuild();
    const lines = [
        '会把这次的结果直接写进 ' + name + '（= ①，你现在在用的那份）。',
        cur && cur !== name ? '（你现在在用的其实是 ' + cur + '；这次改的还是 ① ' + name + '）' : '',
        '',
        // ★两种后果**都说**（不预判用户会勾哪边）—— 原来的写法是"先按当时的勾选状态写死一句"，勾了再改就自相矛盾
        '这条是**覆盖原文件**、不是另存新名。',
        '· 勾上下面那个「同时自动备份」→ 写之前先把原文另存成 ' + backupName + '（在预设下拉里能选到它，想退回原样就选它）。',
        '· 不勾（默认）= **不备份** → 直接改 ' + name + '，改坏了没有副本可退。',
        ord.pinned.size ? '（另有 ' + ord.pinned.size + ' 条「位置待定」的新条目 —— 已经放在顺序表最上面）' : '',
    ];
    /* ★S1-2：「同时自动备份」搬进确认框 —— 勾选状态由 askYesX 的 extraOut 带回来（捕获期 change 监听，关窗也能读到）。
       默认值 = 底栏时代留下的 S.stitchBackup（老会话/脚本设过就沿用）。
       ★按钮文案写**中性的**（"确定写进去"）：勾选框在弹窗里还能改，写死成"直接覆盖（不备份）"就会变成假话。 */
    const bakBox = { on: wantBackup };
    const ans = await askYesX('缝入当前预设（覆盖 ① ' + name + '）', lines, {
        ok: '确定写进去',
        cancel: '算了',
        extraHtml: '<label class="ywpu-bakchk"><input type="checkbox" id="ywpu-confirm-bak"' + (bakBox.on ? ' checked' : '') + '> 同时自动备份</label>',
        extraId: 'ywpu-confirm-bak',
        extraOut: bakBox,
    });
    if (!ans.ok) { toast('info', '好，这次不缝 —— ' + name + ' 一个字都没动'); return; }
    /* ★B12-fix（R9-i）：**以弹窗的返回值 `ans.extra` 为准**（askYesX 现在会把勾选回写进 extraOut，
       但这里显式读返回值，避免将来有人改了 askYesX 的语义又踩同一个坑）。 */
    S.stitchBackup = !!ans.extra;      // 确认框里那一下勾选就是这次的最终口径（写盘用它）
    const doBackup = !!ans.extra;

    try {
        S.busy = true;
        const params = Object.entries(S.params).map(([key, use]) => ({ key, use }));
        const { preset } = PM.buildMerged({
            mine: S.mine, next: S.next, items: S.analysis.items,
            decisions: S.decisions, params, orderMode: S.orderMode,
            orderOverride: ord.override,
            extraEntries: extras(),
            regex: regexArgForBuild(),          // ★R8：预设级正则（同一条路，别只在"生成新预设"上接）
        });
        const r = await stitchWrite({
            name, merged: preset, backup: doBackup,
            io: { list: listPresetNames, read: readPreset, save: savePreset, has: (n) => listPresetNames().includes(n) },
        });
        if (!r.ok) {
            toast('error', '没写进去：' + r.why);
            console.warn('[预设更新器] 缝入当前预设没成', r);
            return;
        }
        // ★写盘会把 ST 的"当前预设"切到刚存的那一份（ST 自己的 updateList 干的，不是我们切的）：
        //   如果你本来用的**不是** ①，就切回去 —— 缝入只该改你在对比里挑的那一份，不该顺手换你在用哪份。
        if (cur && cur !== name) {
            try {
                const pm = presetManager();
                const v = pm && typeof pm.findPreset === 'function' ? pm.findPreset(cur) : null;
                if (v !== undefined && v !== null && v !== '') await pm.selectPreset(v);
                else throw new Error('找不到 ' + cur);
            } catch (e) {
                console.warn('[预设更新器] 缝入后切回原预设失败（预设已经写好了，只是下拉可能停在①那份）', e);
                toast('info', '你现在在用的那份本来是 ' + cur + '——到预设下拉里切回去就行');
            }
        }
        S.extraEntries = [];          // 已经写进那份预设了，清掉避免下次重复缝
        S.selIdents = []; S.orderVisibleIds = null;    // ★W9-5：同上（选择清了 ⇒ "看得见的那份"一起作废）
        S.lastSaved = name;           // ★两条路都真的写盘了（有没有备份不影响"最近一次写的是谁"）
        S.mine = JSON.parse(JSON.stringify(preset));   // ① 现在就是刚写进去的内容（再对比时以它为准）
        S.mineName = name; S.mineFrom = 'preset';
        S.analysis = null; S.decisions = {}; S.blocks = {}; S.posMap = null;
        // ★留个看得见的记录（回分页也能看到"备份在哪 / 这次没备份"）
        S.lastStitch = { name, backupName: r.backupName || '', backedUp: !!r.backedUp, at: Date.now() };
        // ★S1-2：勾选框搬进确认框了 —— "想留退路"这句指路跟着改（别再让用户去底栏找一颗已经不存在的勾选框）
        toast('success', r.backedUp
            ? '已写进 ' + name + '（就是你现在用的那份）—— 备份在 ' + r.backupName + '，在预设下拉里能选到它'
            : '已直接改 ' + name + '，没有备份。（下次想留一份退路，在确认框里把「同时自动备份」勾上再缝）',
            { timeOut: 15000 });
        console.info('[预设更新器] 缝入当前预设', { 目标: name, 备份: r.backedUp ? r.backupName : '（没备份：用户没勾）', 条目数: r.entries });
        notifyStoreStitched(name);
        closeWindow();
        renderSource();
        S.store = null;
    } catch (e) {
        toast('error', '缝入失败：' + (e?.message || e));
        console.warn('[预设更新器] 缝入当前预设炸了', e);
    } finally {
        S.busy = false;
    }
}

// ================================================================ ★Wave B2：识版本三状态（带锁轻量版）
/*  ★为什么要有这一段（plan §3.1~§3.3 / 台账 §CY·§DC·§DD·§DH）：
    作者要的是"**认出就点亮、认不出就明说、判错时让用户自己选**"——比"多标一条"更糟的是**标错**
    （§CX 硬约束：假归属比不标更糟）。B1（内核那一波）已经把**读数**做到够硬：
    `matchPresetVersionFull()`（全量逐条正文哈希 + 整版摘要）+ `rankPresetCandidates()`（冠军/亚军/余量
    `margin`/`marginMin`/`exactNames`），内核**只给读数、不做门禁**。本段的职责 = 那道门禁：
      · 三状态（① 点亮 / ② 明说不可靠 / ③ 认不出 + **可选**手选）；
      · ★`declaredVer` 门禁：**卡/包里声明的基准版本必须与"认出的赢家"一致才允许点亮**；
        库里没有那一版时**绝不回退成"最接近的那一版"**（走状态② 的话术）——B1 实测：V0824 与 V0811
        有 82% 条目逐字相同，"单候选阈值"挡不住（4/4 硬标错版本），防线只能在这儿。
      · 手选（两条路都能选）+ 选完**当场重算** + 选完**记住**；永久缓存（独立持久键 + LRU 3 版）。
    ★三个"照实说"的定位（不许含糊，写进交活报告）：
      ⒜ plan §3.3.1 原本把 `lockBase()` 写成**内核新增纯函数**；本波是"一支一文件"（内核 B1 刚交活、
         派单明令不许再碰 `preset-merge.js`）⇒ 判据挪到**消费侧**（本文件），**判据与话术一个字不改**，
         并且同样做成**纯函数**（`lockVerdict()`：只吃 mine/候选/declaredVer，不碰 DOM、不联网、不读时钟），
         纯 Node 里可以直接拿它当纯函数断言。
      ⒝ plan §3.3.3 的"手动路 ③ **自动填**"本波**不做**（自动填会把 3 套按"两方"造的夹具冲成三方 ——
         plan §9.2 风险 8 自己写明了这条代价）。落成的是**不生效的建议**：手选下拉里把"最像的那一版"
         预选好 + 榜一榜二给一颗 `［V0824］` 按钮，**用户点一下才算数**（点了就是他自己首选的那一版）。
      ⒞ 身份口径写死（与内核同一句话）：识别只看「条目名 + 正文哈希」（`presetFingerprint()` 的口径），
         **整文件 sha256 不进识别链路**（跨社区同版副本的 sha256 全不同，实测）。
    ★界面落点（★相对 plan §3.2③ 的一处**有实测依据的偏离**，见交活报告）：
      plan 写的是"结果窗口**顶部**那条提示条里"；实测（`e2e/tmp/wb2-measure.js`）结果窗口顶部已经**只剩
      4.5px 余量**（r9h ① 卡"列表第一行距顶 ≤30%"= 271.5px，实测 267px）⇒ 顶部**再加一个块**必然
      把双视口首屏硬指标顶破（PC 29.5% → 31.6%）。所以这一条提示 + 手选控件放在**结果窗口底部**
      （`#ywpu-foot`，与它同一行的"三方/两方"胶囊本来就是回答同一件事的）：
      `#ywpu-foot` 是 `#ywpu-body` 的兄弟、**常驻可见、不随滚动跑掉**，且不影响首屏几何。
      ★id/类名/optgroup/文案与 plan §3.2③ **一字不差**（`#ywpu-lock-base`）。 */

/* ==== ywpu-lock-core:start ==== */   // ★这一段会被 e2e/tmp/wb2-lock-core.js 按标记抽出来**真编译**
/** 版本号机器键：'余温V0824.json' → 'V0824'；**取不到版本号返回空串**（要"没有版本号"这个信息时用它）
 *  （`versionLabel()` 是另一件事：它取不到版本号会退回原名，那是给更新包 from/to 用的） */
function verKeyOf(s) { const m = String(s || '').match(/[Vv](\d{3,4})/); return m ? ('V' + m[1]) : ''; }
/** 声明键：有版本号用版本号，没有就用原串（手选一份叫"我的旧版备份"的也能当声明） */
function lockKey(s) { return verKeyOf(s) || String(s == null ? '' : s).trim(); }
/** 版本号数字（多个 EXACT 时"取版本号最大的那一版"，见 D9）：V0824 → 824；取不到 → -1 */
function verNumOf(s) { const k = verKeyOf(s); return k ? Number(k.slice(1)) : -1; }
/** ① 的内容指纹（"这手选是给哪份 ① 选的"靠它；① 一变 ⇒ 那条手选自动作废）—— 内核口径，不含 id */
function mineFpDigest() {
    try { const fp = PM.presetFingerprint(S.mine || {}, { full: true }); return String(fp.digest || fp.hash || ''); } catch (e) { return ''; }
}
/** 名字像不像"官方基准那一版"（plan §3.1① 的"优先：名字像余温V####"，落到实现 = 名字里有 V+3~4 位数字） */
function looksLikeBaseName(n) { return /[Vv]\d{3,4}/.test(String(n || '')); }

/** 本机已装预设里"像官方基准的那些" → 候选（每版一个**全量指纹**；~1ms/版、零网络）
 *  ★**排除 ① 自己**：候选里放着"你自己那份"，冠军永远是你自己（自比 100%、digest 一致）——
 *    那等于拿**名字**当判据（① 叫 V0824 就报 V0824），正是 B1 反复提醒的"硬标一版错版本"。
 *    去掉自己之后，冠军说的才是"**你这份的内容像哪一版**"。 */
function localBaseCandidates() {
    const skip = (S.mineFrom === 'preset' && S.mineName) ? String(S.mineName) : '';
    const out = [];
    for (const n of listPresetNames()) {
        if (!looksLikeBaseName(n)) continue;
        if (skip && String(n) === skip) continue;
        try {
            const p = readPreset(n);
            if (!PM.isValidPreset(p)) continue;
            out.push({ kind: 'preset', name: String(n), ver: verKeyOf(n), title: String(n), fingerprint: PM.presetFingerprint(p, { full: true }) });
        } catch (e) { /* 读不到就跳过 —— 这一份本来就不该进候选，不弹错 */ }
    }
    /* ★Wave E2（plan §技术点 4 的"**本地优先**"）：**本机缓存里已经下过的那几版**同样是候选 ——
       它是从官方基准库（`/base/pack?ver=`，一版一卡、永不原地改）下下来的**同一份内容**，
       指纹在本机算（~1ms）即可 ⇒ 「认版本」连 `/base/list` 这一趟都不用问；
       手选的"云端那一版"也就顺带能跨会话自动恢复（见 `restoreSaved()`）。零网络、零副作用。 */
    return out.concat(cachedBaseCandidates());
}

/** 永久缓存（`yw_pu_base_pack`）里那几版 → 候选（内容 = 云端那份，指纹在本机算；缓存坏了就跳过） */
function cachedBaseCandidates() {
    const out = [];
    const all = baseCacheAll();
    for (const k of Object.keys(all || {})) {
        const p = all[k] && all[k].preset;
        if (!PM.isValidPreset(p)) continue;
        try {
            out.push({
                kind: 'cache', name: String(k), ver: verKeyOf(k) || String(k),
                title: String(k), fingerprint: PM.presetFingerprint(p, { full: true }),
            });
        } catch (e) { /* 缓存里这一份读不出来 ⇒ 跳过（不弹错、不影响别的候选） */ }
    }
    return out;
}

/** 云端基准清单（`GET /base/list`，每版只带一个 ~4.7 KB 全量指纹）→ 候选
 *  · 老后端 / 离线 / 商店模块没加载 / 基准库还没上线 ⇒ 空数组（D3 = **正常情形**：console.info 一行、不弹错）；
 *  · 同一次会话只问一次（`baseListCache`）；★只读，绝不写。 */
let baseListCache = null;
/** ★Wave E2（项3"按需下载"的机器判据 + 项2"缓存三路径"）：**只记账，不改行为** ——
 *  探针读 `__ywpu.lock.net()` 就能证明"两方对比全程 0 次下载""同一版第二次不再下载"。 */
const lockNet = { list: 0, pack: 0, local: 0, cacheHit: 0, cacheWrite: 0, cacheWriteFail: 0, listTimeout: 0 };
async function cloudBaseCandidates() {
    if (baseListCache) return baseListCache;
    const sp = (typeof window !== 'undefined') ? window.__ywStoreApi : null;
    if (!sp || typeof sp.bases !== 'function') { baseListCache = []; return baseListCache; }
    try {
        lockNet.list++;
        const r = await sp.bases();
        const items = (r && Array.isArray(r.items)) ? r.items : [];
        baseListCache = items.map(it => ({
            kind: 'cloud', name: String(it.ver || it.title || ''), ver: verKeyOf(it.ver || it.title),
            title: String(it.title || it.ver || ''), fingerprint: it.fpFull || null,
        })).filter(c => c.ver && c.fingerprint);
        console.info('[预设更新器] 官方基准清单：' + baseListCache.length + ' 版（' + baseListCache.map(c => c.ver).join(' / ') + '）');
    } catch (e) {
        console.info('[预设更新器] 基准清单没取到（离线 / 云端还没上线）⇒ 只用本机已装的那些当候选', (e && e.message) || e);
        baseListCache = [];
    }
    return baseListCache;
}

/** ★Wave E2：这一趟判定**还等着云端清单回来复核**吗？
 *  判据：云端那一层在（`__ywStoreApi.bases` 是个函数）**且**这次会话还没问过（`baseListCache === null`）
 *  **且**本机这一趟没得出"对得上"（对得上 = 有确凿指纹证据，云端来了也只会更强）。
 *  用途**只有一个**：这期间**不许说死**"你这份基于某版"（plan §3.2② 的假读数防线）——
 *  本机那几版看着像 X，云端清单一到可能就翻成 Y；所以先显示"正在和云端核对基准…"。
 *  ★离线 / 取不到清单（`baseListCache` 落成 `[]`）⇒ 不再 pending，本机怎么算就怎么说（D3）。 */
function lockPendingCloud(lk) {
    if (baseListCache !== null) return false;
    const sp = (typeof window !== 'undefined') ? window.__ywStoreApi : null;
    if (!sp || typeof sp.bases !== 'function') return false;
    return !!(lk && lk.state !== 'lit');
}

/* ---------------------------------------------------------------- 永久缓存（§DD 第 3 步 / plan §10.2 Q4）
   口径（写死，与 plan 一字不差）：
     · 落点 = **独立持久键 `yw_pu_base_pack`**（与商店 `yw_store_cache` 同族；**不塞进 ST 的 settings 业务字段**）；
     · 按 `ver → { preset, addedAt }` 存；**最多 3 版（LRU，超出淘汰最旧的）** ⇒ 3 × ~230 KB ≈ 0.7 MB；
     · **为什么永不失效**：官方基准**一版一张、永不原地改**（plan §4.3）⇒ 版本号一样 ⇒ 内容一样 ⇒
       缓存永不过期 ⇒ **一个用户一辈子只下一次**，之后离线可用（§DD 原话）；
     · 写入失败（配额满 / 私密模式）⇒ **降级为内存缓存 + console.info 一行，不弹错**（不阻塞任何操作）。 */
const BASE_CACHE_KEY = 'yw_pu_base_pack';
const BASE_CACHE_MAX = 3;
let baseMemCache = null;          // 持久层写不进去时的降级落点（同一次会话内照样复用）
function baseCacheAll() {
    if (baseMemCache) return baseMemCache;
    try {
        const raw = localStorage.getItem(BASE_CACHE_KEY);
        baseMemCache = raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { baseMemCache = {}; }
    if (!baseMemCache || typeof baseMemCache !== 'object') baseMemCache = {};
    return baseMemCache;
}
function baseCacheGet(ver) {
    try { const hit = baseCacheAll()[String(ver)]; const p = hit && hit.preset; return PM.isValidPreset(p) ? p : null; } catch (e) { return null; }
}
function baseCachePut(ver, preset) {
    const v = String(ver || '');
    if (!v || !PM.isValidPreset(preset)) return false;
    const all = baseCacheAll();
    all[v] = { preset, addedAt: Date.now() };
    const vers = Object.keys(all);
    if (vers.length > BASE_CACHE_MAX) {
        vers.sort((a, b) => (all[a].addedAt || 0) - (all[b].addedAt || 0));   // 最旧的先淘汰（LRU）
        for (const k of vers.slice(0, vers.length - BASE_CACHE_MAX)) delete all[k];
    }
    baseMemCache = all;
    try { localStorage.setItem(BASE_CACHE_KEY, JSON.stringify(all)); lockNet.cacheWrite++; return true; }
    catch (e) {
        // ★配额满 / 私密模式 ⇒ 降级成内存缓存（这一次会话照样能用），**不弹错、不阻塞**
        lockNet.cacheWriteFail++;      // ★Wave E2：写失败这一路径单独记账（探针据此给"降级"的读数）
        console.info('[预设更新器] 基准整份没写进本机缓存（配额满 / 私密模式）→ 这次先用内存缓存，不影响任何操作', (e && e.message) || e);
        return false;
    }
}
function baseCacheClear() { baseMemCache = {}; try { localStorage.removeItem(BASE_CACHE_KEY); } catch (e) { } return true; }

/* ---------------------------------------------------------------- 判据（纯函数） */

/** ★三状态判据（**纯函数**：只吃 mine + 候选 + declaredVer，返回读数 + 话术；不碰 DOM、不联网、不读时钟）
 *  判据表（照 plan §3.1④ / §3.3.2 / §3.3.5，一个字不改）：
 *    EXACT  = 某版 digestSame === true（逐条逐字、含注入顺序都没动过）⇒ 定案；多个 EXACT ⇒ 取版本号最大（D9）
 *    WIN    = 冠军 hitScore ≥ 0.75 且 (冠军−亚军) ≥ marginMin（= max(1, ceil(total×1%))；153 条 → 2 条）
 *    TIE    = 名次差 < marginMin；或（差 ≤ 2 且两边 digest 都不一致）；或（两版都 100% 但都不 digestSame）
 *    不确定档 = 0.6 ≤ hitScore < 0.75（典型 = 用户混用两版）⇒ **不点亮**（D7）；total < 10 也走这一档（D5）
 *    NEAR   = 冠军 hitScore < 0.6（都不太像）/ 候选池空（D3）/ 全部候选 total=0（D1）
 *  退化判据（D1~D11）各自的行为与话术见各分支；**凡算不出确定结论的一律明说 + 不阻塞**，绝不硬标归属。
 *  @param {object} mine 用户手上那份预设
 *  @param {Array} candidates 候选清单（每项要有 fingerprint）
 *  @param {string} declaredVer 卡/包声明的基准版本（手动路 = 用户手选的那一版；空 = 没声明）
 *  @param {{who?:string}} [opts] who = 话术里那个"谁"（'这张卡' / '你选的基准'）
 *  @returns {object} {state, verdict, text, capsule, hits, total, hitScore, margin, marginMin, digestSame, winVer, picks, candidates, rows, reason, …} */
function lockVerdict(mine, candidates, declaredVer, opts) {
    const o = opts || {};
    const isCard = String(o.who || '这张卡') !== '你选的基准';
    const who = isCard ? '这张卡' : '你选的基准';
    const declared = lockKey(declaredVer);
    const cands = (Array.isArray(candidates) ? candidates : []).filter(c => c && c.fingerprint);
    /** "版本键 → 候选那一项"（一键切换按钮要知道它从哪来：本机预设 / 云端清单）
     *  ★Wave H₂ ④（Wave F 报的缺陷 · 本机实测就有 3 份改名过的 V0824）：
     *    **先按"这一份的名字"精确定位**，找不到才退回按版本键。
     *    改前只按版本键 ⇒ 两份同版候选（`lockKey` 都是 `V0824`）被 `find` **都命中同一项**
     *    ⇒ TIE / D9 那两颗建议按钮画出**两颗一模一样**的按钮，用户根本分不清该点哪个。
     *    （判定处 `tieLbl()` 早就会在"版本号撞车时改用那一份的名字" —— 只是改前 `name` 拿不到**不同的**名字。） */
    const pickOf = (name) => {
        const k = lockKey(name);
        const raw = String(name == null ? '' : name).trim();
        const c = cands.find(x => String(x.name || '').trim() === raw)
            || cands.find(x => String(x.title || '').trim() === raw)
            || cands.find(x => lockKey(x.ver || x.name) === k) || null;
        return { ver: k, kind: c ? c.kind : 'preset', name: c ? c.name : k, title: c ? (c.title || c.name) : k };
    };
    const out = {
        declaredVer: declared, declaredInList: false, who, isCard,
        verdict: 'NEAR', state: 'unknown', reason: '',
        text: '', capsule: '',
        hits: 0, total: 0, hitScore: 0, pct: 0, margin: 0, marginMin: 0, digestSame: false,
        winVer: '', championName: '', runnerName: '', exacts: [], picks: [], rows: [], candidates: cands,
    };
    // ---- D2：mine 不是合法预设（空 / 加密 / 损坏 JSON）—— 识别前先挡（调用方也各挡了一道）
    if (!PM.isValidPreset(mine)) {
        out.reason = 'D2';
        out.text = '没读出你这份预设的内容 —— 先确认选中的是「对话补全预设」那一档（不是正则/世界书）。';
        out.capsule = '两方对比（你这份读不出来）';
        return out;
    }
    // ---- D3：候选池为空（本机没有像官方的 + 云端 404/离线）—— 正常情形，不算错
    if (!cands.length) {
        out.reason = 'D3';
        out.text = '这次没有基准可用（离线 / 云端还没上线 / 本机没有那一版）⇒ 两方对比。';
        out.capsule = '两方对比（这次没有基准可用）';
        return out;
    }
    /* ---- plan §3.3.4：候选里有没有"全量指纹"分成两拨 ----------------------------------------------
       · 有全量指纹（`entryHashes`）⇒ 走 B1 的全量档（下面那一套：EXACT/WIN/TIE/NEAR + 余量）；
       · 一个全量的都没有、只有**老抽样指纹**（老包 / 老卡片）⇒ 走**降级路（C 档）**：
         老逻辑（`matchPresetVersion` 抽样 20 条 + `minSampleScore: 0.6`）+ **唯一最优**（严格大于亚军）。
       两拨混着来时**只用全量那一拨**（全量比抽样硬），老指纹那几项照实留在 rows 里给人看。 */
    const fullCands = cands.filter(c => Array.isArray(c.fingerprint.entryHashes));
    const oldCands = cands.filter(c => !Array.isArray(c.fingerprint.entryHashes));
    if (!fullCands.length) {
        out.degradedRoute = true;
        out.rows = oldCands.map((c) => {
            try { return Object.assign({ name: lockKey(c.ver || c.name) }, PM.matchPresetVersion(mine, c.fingerprint, { minSampleScore: 0.6 })); }
            catch (e) { return { name: lockKey(c.ver || c.name), ok: false, score: 0, error: String((e && e.message) || e) }; }
        });
        let best = null, second = -1;
        for (const r of out.rows) {
            if (!r.ok) continue;
            if (!best || r.score > best.score) { second = best ? best.score : -1; best = r; }
            else if (r.score > second) second = r.score;
        }
        out.winVer = best ? lockKey(best.name) : '';
        out.degradedWin = !!(best && best.score > second);
        out.verdict = out.degradedWin ? 'WIN' : 'NEAR';
        out.pct = best ? Math.round((Number(best.score) || 0) * 100) : 0;
        out.readout = best ? ('抽样 ' + best.sameSamples + '/' + best.totalSamples + ' 条（这几版只有旧指纹，认不出够不够准）') : '';
        out.championName = out.winVer;
        out.hits = null; out.total = null; out.hitScore = null;   // ★全量读数照实为 null（不编数字）
        return lockGate(out);
    }

    let rank = null;
    try { rank = PM.rankPresetCandidates(mine, fullCands, {}); }
    catch (e) {
        console.warn('[预设更新器] 认版本算不出来（当成"认不出"处理：不点亮、也不拦任何操作）', e);
        out.reason = 'D1';
        out.text = '⚠ 基准比对算不出来（数据有问题）⇒ 判不了"谁改的"。两边不一样的地方照样逐条列在下面。';
        out.capsule = '两方对比（基准比对失败）';
        return out;
    }
    out.rows = rank.rows || [];
    out.margin = rank.margin || 0;
    out.marginMin = rank.marginMin || 0;
    out.exacts = (rank.exactNames || []).slice();
    /* ★Wave H₂ ④（Wave F 报的"两颗同名按钮"· 根因实测）：`rank.exactNames` 里装的是**版本键**，不是名字 ——
       内核 `rankPresetCandidates()` 里 `const name = String(c.ver || c.name || …)`（有 ver 就用 ver），
       于是**同版的两份副本**（本机实测就有 3 份改名过的 V0824）都拿到 `'V0824'` ⇒ 从名字再也分不出是哪一份。
       内核现在是干净基线、**不许碰** ⇒ 在这一侧按**候选自己**把那几份"整版摘要一致"的捞出来
       （同一条指纹再判一次；只走这一支、候选也就几份，成本可忽略）。拿它们的**真名字**喂 `pickOf()`。 */
    const exactCands = fullCands.filter((c) => {
        try { const m = PM.matchPresetVersionFull(mine, c.fingerprint, {}); return !!(m && m.digestSame === true); }
        catch (e) { return false; }
    });
    const champ = rank.champion || null, run2 = rank.runnerUp || null;
    out.championName = champ ? String(champ.name || '') : '';
    out.runnerName = run2 ? String(run2.name || '') : '';
    // ---- D1：所有候选都"读不出条目"（空预设 / 加密件 / 云端那份形状不对）—— 绝不许拿 0/0 当 100%
    if (!champ || !(Number(champ.total) > 0)) {
        out.reason = 'D1';
        out.text = '⚠ 这份基准读不出条目（可能是空预设 / 加密件 / 文件损坏）⇒ 判不了"谁改的"。两边不一样的地方照样逐条列在下面。';
        out.capsule = '两方对比（基准读不出条目）';
        return out;
    }
    out.hits = Number(champ.hits) || 0;
    out.total = Number(champ.total) || 0;
    out.hitScore = Number(champ.hitScore) || 0;
    out.pct = Math.round(out.hitScore * 100);
    out.digestSame = champ.digestSame === true;
    const bothNoDigest = !(champ.digestSame === true) && !(run2 && run2.digestSame === true);
    const tooClose = (out.margin < out.marginMin)
        || (out.margin <= 2 && bothNoDigest)
        || (out.hitScore >= 1 && !!run2 && Number(run2.hitScore) >= 1 && bothNoDigest);
    if (out.exacts.length) {
        // D9：多个 EXACT（内容一致的两版，比如只改了标题 / 跨社区去追溯码后等值）⇒ 取**版本号最大**那版
        const sorted = out.exacts.slice().sort((a, b) => verNumOf(b) - verNumOf(a));
        out.verdict = 'EXACT';
        out.winVer = lockKey(sorted[0]);
        /* ★Wave H₂ ④：挑出"内容一致"那几份**候选自己**（真名字有区分度）；版本号相同时按候选原顺序（稳定）——
           `winVer` 仍与改前逐字相同（同版时两个 'V0824' 本来就一样）。 */
        const sortedC = exactCands.slice().sort((a, b) => verNumOf(b.ver || b.name) - verNumOf(a.ver || a.name));
        if (sorted.length > 1) {
            const other = sortedC[1];
            /* 版本号撞车（同版两份副本）⇒ 另一版**报名字**才有用（报两遍 'V0824' 等于没说）。 */
            const otherLbl = (other && lockKey(other.ver || other.name) === out.winVer)
                ? (other.name || out.winVer) : lockKey(sorted[1]);
            out.d9 = '这两版内容一致，按「' + out.winVer + '」处理（另一版是「' + otherLbl + '」）。';
        }
        out.picks = sortedC.length
            ? [pickOf(sortedC[0].name)].concat(sortedC.length > 1 ? [pickOf(sortedC[1].name)] : [])
            : [pickOf(sorted[0])].concat(sorted.length > 1 ? [pickOf(sorted[1])] : []);
    } else if (out.hitScore < 0.6) {
        out.verdict = 'NEAR';
        out.winVer = lockKey(champ.name);
    } else if (tooClose) {
        out.verdict = 'TIE';
        out.winVer = lockKey(champ.name);
        out.picks = [pickOf(champ.name)].concat(run2 ? [pickOf(run2.name)] : []);
    } else if (out.total < 10) {
        // D5：条目太少 ⇒ 分辨力天然粗（余量 1 条 = 20%）⇒ 即使 WIN 也只给"不确定档"
        out.verdict = 'UNCERTAIN'; out.reason = 'D5'; out.winVer = lockKey(champ.name);
    } else if (out.hitScore >= 0.75) {
        out.verdict = 'WIN'; out.winVer = lockKey(champ.name);
    } else {
        out.verdict = 'UNCERTAIN'; out.reason = 'D7'; out.winVer = lockKey(champ.name);
    }
    /* ★门禁（三状态分派）：**全量档与退化档共用同一份**（绝不许两处各写一份 —— 一分叉就会出现
       "两个档位的话术不一样"这种最难查的 bug）。`lockGate()` 定义在本函数末尾（函数声明提升）。 */
    return lockGate(out);

    function lockGate(o) {
    const out = o;
    out.declaredInList = !!declared && cands.some(c => lockKey(c.ver || c.name) === declared);
    const readout = out.readout || (out.hits + '/' + out.total);
        /* ★TIE 两版的**叫法**：版本号撞车时（本机装着同版的两份副本 —— 实测真机上就有 3 份改名过的 V0824），
           两个按钮 / 两处引号全印「V0824」= 用户根本分不清该点哪个 ⇒ 撞车时改用**那一份的名字**。 */
        const tieLbl = (p, q) => (p && q && p.ver === q.ver) ? String(p.name || p.ver) : String((p && p.ver) || '另一版');
    // ---- 状态③：**没有声明**（手动路 / 老卡没写）—— 认出谁最像也只当"建议"，绝不点亮
    if (!declared) {
        out.state = 'unknown';
        if (out.verdict === 'EXACT' || out.verdict === 'WIN' || out.verdict === 'UNCERTAIN') {
            out.text = '⚠ ' + (isCard ? '这张卡没写它基于哪一版官方预设' : '没有声明基准是哪一版')
                + '，你这份像是 ' + out.winVer + '（全量对得上 ' + readout + ' 条）⇒ 判断不了"谁改的"。两边不一样的地方照样逐条列在下面。';
        } else if (out.verdict === 'TIE') {
            /* ★TIE 在状态③里也要**明说"像两版"**（不能落进下面那句"都不太像"—— 那份读数明明是
               两边都 100% 对得上，说"不太像"就是假读数，正是本波要防的）。给两颗建议按钮。 */
            out.reason = out.reason || 'D8';
            out.text = '⚠ 你这份像是「' + tieLbl(out.picks[0], out.picks[1]) + '」也像是「' + tieLbl(out.picks[1], out.picks[0])
                + '」（两边都对得上 ' + readout + ' 条）—— 我不猜。'
                + (isCard ? '这张卡也没写它基于哪一版官方预设。' : '') + '确认一下是哪个：';
            out.capsule = '两方对比（基准像两版，没敢定）';
            out.picks = (out.picks || []).slice(0, 2);
            return out;
        } else {
            out.text = '你这份跟官方那几版都不太像（最像的是「' + out.winVer + '」，也只有 ' + out.pct + '% 对得上）⇒ 判断不了"谁改的"（不猜）。你也可以自己选一份当基准：';
        }
        out.capsule = '两方对比（判不了谁改的）· 没认出你基于哪一版';
        out.picks = (out.hitScore >= 0.6 && out.winVer) ? [pickOf(out.winVer)] : [];
        return out;
    }
    // ---- ★状态① 的唯一条件 = 认出的赢家 === 声明（plan §3.1④ / D4-⒜）
    if ((out.verdict === 'EXACT' || out.verdict === 'WIN') && out.winVer && out.winVer === declared) {
        out.state = 'lit';
        out.text = '✓ 基准对得上（' + out.winVer + '）：全量对得上 ' + readout + ' 条'
            + (out.digestSame ? ' · 整版摘要一致（逐条逐字、含顺序都没动过）' : '')
            + (out.d9 ? '　' + out.d9 : '');
        out.capsule = '三方对比（' + (isCard ? '这张卡基于 ' : '基准 ') + out.winVer + ' · 你这份也是 ' + declared + ' · ' + readout + '）';
        return out;
    }
    // ---- 状态②：认出但**校验不过** / 认不出 / 像两版 —— 一律明说 + **绝不硬标归属**
    out.state = 'unreliable';
    if ((out.verdict === 'EXACT' || out.verdict === 'WIN') && out.winVer !== declared) {
        if (out.declaredInList) {
            out.reason = 'B-i';
            out.text = '⚠ ' + who + '基于 ' + declared + '，你这份基于 ' + out.winVer
                + ' ⇒ 归属判断不可靠（不标"谁改的"）。两边不一样的地方照样逐条列在下面，你想留哪边就点哪边。';
            out.capsule = '两方对比（判不了谁改的）· 基准不一致';
        } else {
            // ★②(ii)：**库里根本没有声明的那一版** ⇒ **绝不回退成"最接近的那一版"**（D4-⒝ / 假警报）
            out.reason = 'D4';
            out.text = '⚠ 官方基准库里没有「' + declared + '」这一版 ⇒ 只能看出你这份和' + (isCard ? '这张卡' : '这一版')
                + '不一样，猜不出谁改的（不猜）。两边不一样的地方照样逐条列在下面。';
            out.capsule = '两方对比（判不了谁改的）· 库里没有那一版';
        }
        out.picks = [pickOf(out.winVer)];
        return out;
    }
    if (out.verdict === 'TIE') {
        out.reason = 'D8';
        out.text = '⚠ 你这份像是「' + tieLbl(out.picks[0], out.picks[1]) + '」也像是「' + tieLbl(out.picks[1], out.picks[0])
            + '」（两边都对得上 ' + readout + ' 条）—— 我不猜。确认一下是哪个：';
        out.capsule = '两方对比（基准像两版，没敢定）';
    } else if (out.verdict === 'UNCERTAIN') {
        out.text = (out.reason === 'D5')
            ? ('⚠ 你这份只有 ' + out.total + ' 条，官方那几版也都很短 ⇒ 对得上也说明不了什么（条目太少，分辨力不够），不标"谁改的"。')
            : ('⚠ 你这份跟「' + out.winVer + '」对得上 ' + out.pct + '%（不到"能确定"的 75%）⇒ 不敢标"谁改的"。两边不一样的地方照样逐条列在下面。');
        out.capsule = '两方对比（基准对得上 ' + out.pct + '%，不敢定）';
    } else {
        out.reason = out.reason || 'D7';
        out.text = '⚠ 没认出你这份是基于哪一版官方预设（' + (isCard ? '卡写的是 ' : '你选的是 ') + declared
            + '）⇒ 判断不了"谁改的"。下面照样逐条挑。';
        out.capsule = '两方对比（判不了谁改的）· 基准不一致';
    }
    if (!out.picks.length && out.hitScore >= 0.6 && out.winVer) out.picks = [pickOf(out.winVer)];
    return out;
    }
}

/** ① 的"点亮"判据（**只有**它说了算：`whoPillHtml` / 正则那枚胶囊 / 底栏胶囊都问它）
 *  ★总开关 `settings.baseLock === false` ⇒ 整个退回旧口径（= "三方对比就点亮"、不校验、不拦）——
 *    这是一行回滚，也是本波"假证性"的正向对照（关掉它 ⇒ 状态② 会重新变成硬标）。 */
function lockLitNow() {
    const three = !!(S.analysis && S.analysis.stats && S.analysis.stats.threeWay);
    if (getSettings().baseLock === false) return three;
    return !!(S.lock && S.lock.state === 'lit');
}

/* ---------------------------------------------------------------- 管线（两条路共用同一份） */

/** 纯函数：{mine, next, base} → {analysis, decisions}（**不碰 DOM**、不读 S 的别的东西）
 *  plan §3.2③ ⒝：手工路 / 商店路的重算**都**走它 ⇒ 它可以在纯 Node 里被断言。 */
function recomputeWithBase(input) {
    const o = input || {};
    const mine = o.mine || S.mine, next = o.next || S.next;
    const an = PM.analyze({ mine, next, base: o.base || undefined, unpairKeys: S.unpair });
    const decisions = {};
    const keep = o.preserve ? (o.decisions || S.decisions || {}) : null;
    for (const it of an.items) {
        const kept = keep && keep[it.key];
        if (kept && kept.source) decisions[it.key] = kept;
        else if (!PM.needsChoice(it)) decisions[it.key] = PM.fallbackDecision(it);
        else decisions[it.key] = { source: null };
    }
    return { analysis: an, decisions };
}

/** ★Wave E2：基准整份**异步**到手之后，把三方分析补齐（**同一个** `recomputeWithBase()`，不另写一份）。
 *  为什么必须有这一步：商店路 `openStorePack()` 里 `lockRun()` 排在 `runAnalyze()` **之前**，
 *  而"云端兜底"取那一版整份是**异步**的（`/base/pack` 一来一回）⇒ 不补这一步，`S.analysis` 里就没有 base：
 *  底栏说"三方对比"、条目行却画不出「谁改的」（实测 first pass：`threeWay=false`、徽标 0）。
 *  口径与手选那条路**一字不差**（`applyLockChoice` 第 4 步）：保留用户已经挑好的决策、正则那一层一起重算。 */
function lockRebuildWithBase() {
    if (!S.base || !S.mine || !S.next) return false;
    try {
        const { analysis, decisions } = recomputeWithBase({ mine: S.mine, next: S.next, base: S.base, preserve: true, decisions: S.decisions });
        S.analysis = analysis; S.decisions = decisions;
        analyzeRegexesIntoState(S.regexDecisions);
        return true;
    } catch (e) {
        console.warn('[预设更新器] 基准整份到手后重算失败（照旧两方对比，不影响任何操作）', e);
        return false;
    }
}

/** 状态① 要的那一版整份：**本地优先**（你本机装着那一版 → readPreset，0 网络）→ 缓存 → 云端兜底
 *  @returns {boolean} 本地/缓存这一趟拿到了没有（拿不到 = 交给异步那一支去问云端） */
function lockApplyBaseLocal(lk) {
    if (S.base && PM.isValidPreset(S.base) && lockKey(S.baseName) === lk.declaredVer) return true;   // 已经拿着了
    const pool = (lk.candidates || []).filter(c => lockKey(c.ver || c.name) === lk.declaredVer);
    let best = null, bestScore = -1;
    for (const c of pool) {
        // 同一版可能有好几份副本（原件 / 测试副本 / 商店件）—— 取"离你这份最近"的那一份当基准
        let m = null;
        try { m = PM.matchPresetVersionFull(S.mine, c.fingerprint, {}); } catch (e) { continue; }
        const sc = (m.digestSame === true ? 1e9 : 0) + (Number(m.hits) || 0);
        if (sc > bestScore) { bestScore = sc; best = c; }
    }
    if (best && best.kind === 'preset') {
        try {
            const p = readPreset(best.name);
            if (PM.isValidPreset(p)) { S.base = p; S.baseName = best.name; S.baseFrom = 'preset'; lockNet.local++; return true; }
        } catch (e) { console.warn('[预设更新器] 基准整份读不出来（退回云端）', best.name, e); }
    }
    const hit = baseCacheGet(lk.declaredVer);
    if (hit) { S.base = hit; S.baseName = lk.declaredVer; S.baseFrom = 'cloud'; lockNet.cacheHit++; return true; }
    return false;
}

/** 状态① 的云端兜底：`GET /base/pack?ver=`（~230 KB，一次）→ **永久缓存在本机**（同一个版本一辈子只下一次） */
async function lockApplyBaseCloud(lk) {
    const sp = (typeof window !== 'undefined') ? window.__ywStoreApi : null;
    if (!sp || typeof sp.basePack !== 'function') return false;
    try {
        lockNet.pack++;                       // ★Wave E2：**真下载**只有这一处（项3 的读数锚点）
        const r = await sp.basePack(lk.declaredVer);
        const p = r && (r.preset || r.pack || r);
        if (!PM.isValidPreset(p)) { console.info('[预设更新器] 云端那一版读不出条目（没当基准用）', lk.declaredVer); return false; }
        baseCachePut(lk.declaredVer, p);
        S.base = p; S.baseName = lk.declaredVer; S.baseFrom = 'cloud';
        return true;
    } catch (e) {
        console.info('[预设更新器] 云端没取到「' + lk.declaredVer + '」的整份 ⇒ 这次退回两方对比', (e && e.message) || e);
        return false;
    }
}

/** 就地重绘（**唯一的重绘口**）：算完 S.analysis 之后调它 —— 保留滚动（铁律：任何重绘都不许让滚动跳掉） */
function lockRedraw() {
    const body = $el('#ywpu-body');
    const top = body ? body.scrollTop : 0;
    renderResult();          // 结果区（含条目行里的「谁改的」徽标 = lockLitNow()）
    renderFoot();            // 底栏（胶囊 + 基准提示条）
    applyAutoInkAll();
    const b2 = $el('#ywpu-body');
    if (b2) b2.scrollTop = top;
}

/** ★三状态管线（**两条路共用这一条**；plan §3.2③ ⒝ / 商店路那条"不许留无管线的洞"）
 *  · 同步那一趟（`cloud:false`）：只用**本机已装**的候选 ⇒ 结果当场可用（不阻塞渲染，不等于不判）；
 *  · 状态① 需要那一版整份：本地/缓存拿不到 ⇒ 先把"没取回来"如实报出来，再异步去问云端（拿到就地重绘）；
 *  · 异步那一趟（云端清单到手）：**只在同步这一趟没定案时**才重算（省一次比对，也避免"网络慢就晃一下"）。
 *  @param {{declaredVer?:string, who?:string, cloud?:boolean, redraw?:boolean}} o
 *  @returns {object} S.lock */
function lockRun(o) {
    const opt = o || {};
    const declared = String(opt.declaredVer || '');
    const who = String(opt.who || '这张卡');
    S.lockDeclared = declared; S.lockWho = who;
    let lk = lockVerdict(S.mine, localBaseCandidates(), declared, { who });
    if (lk.state === 'lit') {
        if (!lockApplyBaseLocal(lk)) {
            lk = Object.assign({}, lk, {
                state: 'nobase',
                text: '⚠ 基准对上了（' + lk.winVer + '），但那一版的整份还没取回来（本机没有 / 云端没有）⇒ 这次只能两方对比。',
                capsule: '两方对比（基准没取回来）',
            });
            // 异步：先把整份要回来（拿到 → 重算 + 就地重绘）
            lockApplyBaseCloud(lk).then(got => {
                if (!got) return;
                const again = lockVerdict(S.mine, localBaseCandidates(), declared, { who });
                S.lock = again;
                if (again.state === 'lit' && lockApplyBaseLocal(again)) { lockRebuildWithBase(); lockRedraw(); }
            });
        }
    }
    S.lock = lk;
    /* ★Wave E2：这一趟要不要"先别说死"（见 `lockPendingCloud()`）——`cloud:false`（手选当场重算）永远不算 pending：
       那是用户自己指的那一版，判据就得当场说清楚。 */
    S.lockPending = (opt.cloud !== false) && lockPendingCloud(lk);
    // 异步那一趟：本机那批**没定案**时，去问云端清单（拿到 ⇒ 重算 + 就地重绘）
    if (opt.cloud !== false && lk.state !== 'lit') lockRunCloud(declared, who);
    if (opt.redraw) lockRedraw();
    return S.lock;
}

/** 异步那一趟：云端清单 → 重算 → （够得着就）把整份也取回来 → 就地重绘。
 *  ★网络慢/没有网都不会让界面等：这一支只在**算完有变化**时才动 DOM。 */
/** ★Wave W12（2026-09-24 · 作者第 22 批 #1「一直显示正在核对基准、等不到结束」）：这一趟最多让界面等多久。
 *  ★为什么必须有它（改前有**两个**都能把界面永久卡在"正在核对"的坑，一个都没堵）：
 *    ① 请求不回来（网络黑洞 / 后端挂住 / 半死的 CDN）⇒ `await` 永不落地 ⇒ 两面旗永远挂着：
 *       药丸一直印「正在核对基准（本机那几版还不能确定）」，而且 `startCompare()` 开头那句
 *       `if (S.lockBusy) { toast; return; }` 会把**每一次「开始对比」都吞掉**
 *       （作者原话："我还一直等待他核对结束 结果它一直显示这个"）；
 *    ② 这一趟里任何一句抛了（`lockRedraw()` 就夹在两面旗**中间**）⇒ async 函数直接 reject，
 *       旗子再也回不来（`lockRun()` 没接住它，控制台只留一条 unhandled rejection）。
 *  ⇒ 口径（作者要的"**一定有终态**"）：拿到就照实说；**超时 / 离线 / 取不到 / 出岔子一律当场降级**成
 *     "本机这几版怎么说"（D1~D11 那套现成人话**一个字没改**），一个字都不许卡在"正在…"。
 *  ★3 秒的来由：生产 `GET /base/list` 本机实测 **0.93s**（只读）；商店那一层的单次请求超时是 8s
 *     （`preset-store.js` 的 `TIMEOUT`）⇒ 3s 覆盖得住正常一个来回，又远小于"用户开始怀疑卡死"的时间。 */
const LOCK_CLOUD_WAIT_MS = 3000;
/** 等云端清单，**最多 `LOCK_CLOUD_WAIT_MS`**：超时 ⇒ 当成"这次没有清单"（`[]`），迟到的那份交给 `lockCloudLate()`。
 *  ★超时**不取消**那一趟请求：`cloudBaseCandidates()` 自己会把它写进 `baseListCache`（同会话只问一次）⇒
 *    迟到的结果一条都不浪费；这里只是**不让界面等它**（Wave E2 的"按需下载 / 一版一辈子下一次"一个字没动）。
 *  @returns {Promise<Array>} 云端候选（拿不到就是空数组 ⇒ 调用方照 D3 说"这次没有基准可用"） */
function lockCloudWait(declared, who) {
    const seq = (S.lockCloudSeq = (Number(S.lockCloudSeq) || 0) + 1);
    let settled = false;
    const p = Promise.resolve().then(() => cloudBaseCandidates());
    return new Promise((resolve) => {
        const t = setTimeout(() => {
            if (settled) return;
            settled = true;
            lockNet.listTimeout++;                       // ★只记账（探针据此给"超时"读数）
            console.info('[预设更新器] 基准清单这一趟等满 ' + Math.round(LOCK_CLOUD_WAIT_MS / 1000)
                + ' 秒还没回来（网慢 / 连不上 / 后端挂住）⇒ 先按本机这几版照实说，界面不再等它');
            resolve([]);
        }, LOCK_CLOUD_WAIT_MS);
        const done = (v) => { if (settled) return; settled = true; clearTimeout(t); resolve(v || []); };
        p.then((extra) => { if (settled) return lockCloudLate(seq, extra, declared, who); done(extra); }, () => done([]));
    });
}
/** 超时之后**才回来**的云端清单：只有它还是"当前那一趟"时才补算 + 就地重绘
 *  （判据 = 序号没被后一趟顶掉、且声明/口径一个字没变 —— 免得把上一轮 ①② 的判定盖到这一轮上）。 */
function lockCloudLate(seq, extra, declared, who) {
    if (!extra || !extra.length) return;
    if (seq !== S.lockCloudSeq) return;
    if (String(S.lockDeclared || '') !== String(declared || '') || String(S.lockWho || '') !== String(who || '')) return;
    console.info('[预设更新器] 基准清单迟到了（超时之后才回来）⇒ 就地补算一次（界面早就没在等它）');
    lockCloudApply(extra, declared, who, false).catch(e => console.warn('[预设更新器] 迟到的清单补算失败（不影响任何操作）', e));
}
/** 云端清单到手之后那一趟：重算 →（够得着就）把整份也取回来 → 就地重绘。
 *  `lockRunCloud`（正常那一趟）与 `lockCloudLate`（超时后补的那一趟）**共用这一个**（原来这两件事粘在 lockRunCloud 里）。
 *  @param {boolean} forceRedraw 旗子刚从"正在核对"放下来 ⇒ 欠用户一次重画（药丸必须翻成照实那一句） */
async function lockCloudApply(extra, declared, who, forceRedraw) {
    const cands = localBaseCandidates().concat(extra);
    let lk = lockVerdict(S.mine, cands, declared, { who });
    let rebuilt = false;
    if (lk.state === 'lit' && !lockApplyBaseLocal(lk)) {
        const got = await lockApplyBaseCloud(lk);
        if (got) rebuilt = lockRebuildWithBase();       // ★Wave E2：云端到手 ⇒ 把三方分析补齐（否则 threeWay 还是 false）
        else {
            lk = Object.assign({}, lk, {
                state: 'nobase',
                text: '⚠ 基准对上了（' + lk.winVer + '），但那一版的整份没取回来（网络 / 云端没有）⇒ 这次只能两方对比。',
                capsule: '两方对比（基准没取回来）',
            });
        }
    }
    // 只在"判定结果真的变了"（或三方分析刚补齐 / 药丸刚从"正在核对"放下来）时才重绘（避免动画闪、也避免白跑一次 DOM 大改）
    const before = S.lock ? [S.lock.state, S.lock.verdict, S.lock.winVer, S.lock.text].join('|') : '';
    const after = [lk.state, lk.verdict, lk.winVer, lk.text].join('|');
    S.lock = lk;
    if ((after !== before || rebuilt || forceRedraw) && $el('#ywpu-root') && $el('#ywpu-root').classList.contains('ywpu-open')) lockRedraw();
}

/** 异步那一趟：云端清单 → 重算 →（够得着就）把整份也取回来 → 就地重绘。
 *  ★网络慢/没有网都不会让界面等：这一支只在**算完有变化**时才动 DOM。 */
async function lockRunCloud(declared, who) {
    /* ★没有云端那一层（老后端 / 商店模块没加载 / 基准库还没上线）⇒ **一个字节都不动**：
       连那句「正在核对基准…」都不出现（否则每次开一次对比都要白重绘两遍）。 */
    const sp = (typeof window !== 'undefined') ? window.__ywStoreApi : null;
    if (!sp || typeof sp.bases !== 'function') return;
    const isOpen = () => !!($el('#ywpu-root') && $el('#ywpu-root').classList.contains('ywpu-open'));
    /* ★Wave W12：这趟要把药丸印成"正在核对" ⇒ 等一下**欠用户一次重画**（旗子放下之后必须翻成照实那句）。 */
    const pillWasPending = !!S.lockPending;
    S.lockBusy = '正在核对基准…';
    let extra = [];
    try {
        if (isOpen()) lockRedraw();
        extra = await lockCloudWait(declared, who);
    } catch (e) {
        console.info('[预设更新器] 云端清单这一趟没走完（离线 / 出岔子都算"这次没有清单"）', (e && e.message) || e);
        extra = [];
    } finally {
        /* ★★Wave W12（作者第 22 批 #1）：**终态就在这儿** —— 拿到 / 拿不到 / 等超时 / 中间哪一句抛了，
           两面旗一律在这放下。改前这两行排在 `await` **之后** ⇒ 只要上面没回来，药丸就永远印
           「正在核对基准（本机那几版还不能确定）」，而且每一次「开始对比」都会被 `startCompare()` 开头那句
           `if (S.lockBusy)` 吞掉 —— 界面上看就是"一直核对不完"。 */
        S.lockBusy = '';
        S.lockPending = false;               // ★Wave E2：问过了（拿到 / 没拿到 / 等超时都算问过）⇒ 不再"别说死"
    }
    /* ★这一趟**收尾**也一律接住：拿不到清单时那句"降级重画"同样在 try 里 ——
       否则它一抛，async 函数照样 reject（旗子虽然已经放下了，但控制台会多一条 unhandled rejection）。 */
    try {
        if (!extra.length) { if (isOpen()) lockRedraw(); return; }        // ★拿不到 ⇒ 当场降级成"本机这几版照实说"
        await lockCloudApply(extra, declared, who, pillWasPending);
    } catch (e) {
        console.warn('[预设更新器] 云端那一趟收尾时出了岔子（界面已经是终态，照旧两方可用）', e);
    }
}

/** 手动路 / 商店路都要：给 **①** 换人了 ⇒ 上次手选的基准自动作废（plan §3.2③ 第 6 步 / §6.3 ④）
 *  "假归属"的第二大来源（仅次于版本认错）。① 一变 ⇒ `lastBaseFor` 对不上 ⇒ 这条手选不认。 */
function basePickStillValid() {
    const st = getSettings();
    if (!st.lastBaseName) return true;                 // 压根没有手选过
    if (!st.lastBaseFor) return true;                  // 老数据（没记过"给哪份①选的"）⇒ 按老行为保留，由门禁兜
    try { return String(st.lastBaseFor) === mineFpDigest(); } catch (e) { return true; }
}
function dropStaleBasePick() {
    const st = getSettings();
    if (!st.lastBaseName || basePickStillValid()) return false;
    console.info('[预设更新器] 你换过 ① 了 ⇒ 上次手选的基准（' + st.lastBaseName + '）自动作废，免得判出假归属');
    st.lastBaseName = ''; st.lastBaseFor = ''; saveSettings();
    return true;
}

/* ---------------------------------------------------------------- 手选（当场重算 + 记住） */

/** ★Wave E2（plan §3.2③ ⒞「反向也要能撤销」）：把基准**清掉** ⇒ 退回两方对比（滚动不动）。
 *  入口 = 手选下拉里那个 `（不指定：判不了"谁改的"）`。
 *  ★为什么必须有：手选选**错**一版（或本来就不想填了）时，用户得能自己退回来 ——
 *    否则那笔手选会一直挂到"① 换人"才作废（=`S.base` 也一直算着三方，属于用户按不掉的残留）。 */
function clearLockBase() {
    const st = getSettings();
    const had = !!(S.base || S.baseName || st.lastBaseName);
    st.lastBaseName = ''; st.lastBaseFor = '';
    S.base = null; S.baseName = ''; S.baseFrom = '';
    saveSettings();
    if (S.mine && S.next) {
        try {
            const { analysis, decisions } = recomputeWithBase({ mine: S.mine, next: S.next, base: null, preserve: true, decisions: S.decisions });
            S.analysis = analysis; S.decisions = decisions;
            analyzeRegexesIntoState(S.regexDecisions);
        } catch (e) { console.warn('[预设更新器] 清掉基准后回两方算失败', e); }
    }
    lockRun({ declaredVer: '', who: '你选的基准', cloud: false });
    lockRedraw();
    if (had) console.info('[预设更新器] 基准已清掉 ⇒ 回到两方对比（照样逐条挑、另存新预设）');
    return true;
}

/** 手选一份基准 → **当场重算**（plan §3.2③ 的 6 步，逐步骤落地；两条路都是这一个入口）
 *  @param {'preset'|'cloud'|'file'} from
 *  @param {string} value 预设名 / 版本号 / 文件名（file 时只当显示名）
 *  @param {object} [presetObj] file 路：已经读好的那份预设
 *  @returns {Promise<boolean>} */
async function applyLockChoice(from, value, presetObj) {
    const name = String(value || '');
    if (!name && from !== 'file') { return false; }
    if (!S.mine || !S.next) { toast('warning', '先选好 ① 你的预设 和 ② 新版预设'); return false; }
    let base = presetObj || null;
    let baseName = name;
    try {
        if (from === 'preset') { base = readPreset(name); baseName = name; }                       // 2. 取整份（本机）
        else if (from === 'cloud') {                                                                // 2. 取整份（云端）
            const sp = window.__ywStoreApi;
            const hit = baseCacheGet(name);
            if (hit) { base = hit; baseName = name; lockNet.cacheHit++; }                            // ★Wave E2：缓存里就有 ⇒ **不重下**
            else if (sp && typeof sp.basePack === 'function') {
                lockNet.pack++;                                                                     // ★Wave E2：真下载（只在"缓存里没有"时）
                const r = await sp.basePack(name);
                base = r && (r.preset || r.pack || r);
                baseCachePut(name, base);
                baseName = name;
            } else { toast('info', '这次取不到云端那一版（离线 / 基准库还没上线）⇒ 基准先不换，两方照样能挑。'); return false; }
        }
    } catch (e) {
        toast('error', '读不出那一版：' + ((e && e.message) || e));
        return false;
    }
    // 3. 过校验（不合法 ⇒ D1/D2 的话术，明说 + 不动现状）
    if (!PM.isValidPreset(base)) {
        toast('warning', '「' + lockKey(baseName) + '」读不出条目（可能是空预设 / 加密件 / 文件坏了）⇒ 这份当不了基准，两边照样逐条挑。');
        return false;
    }
    // 4. 落 S.base ⇒ 就地重算（**同一个 recomputeWithBase**）
    const prevBase = S.base, prevName = S.baseName, prevFrom = S.baseFrom;
    S.base = base; S.baseName = baseName; S.baseFrom = from;
    const { analysis, decisions } = recomputeWithBase({ mine: S.mine, next: S.next, base: base, preserve: true, decisions: S.decisions });
    S.analysis = analysis; S.decisions = decisions;
    analyzeRegexesIntoState(S.regexDecisions);        // 正则那一层跟着基准一起重算（同一个 base）
    // 5. 算三状态 + 6. 落盘（记住"这手选是给哪份①选的"）
    const lk = lockRun({ declaredVer: baseName, who: '你选的基准', cloud: false });
    getSettings().lastBaseName = baseName;
    getSettings().lastBaseFor = mineFpDigest();
    saveSettings();
    lockRedraw();
    // 读数：成功 / 失败都明说（plan §3.2③ 的两句逐字话术）
    if (lk.state === 'lit') {
        toast('success', '已按「' + lk.winVer + '」重算（全量对得上 ' + lk.hits + '/' + lk.total + ' 条）→ 现在能判"谁改的"了。');
    } else if (lk.verdict === 'TIE') {
        /* ★真鼠标用例当场抓到的一条**假读数文案**（2026-09-23 夜间）：TIE 时你选的这一版**是对得上的**
           （读数 132/134 = 98.5%），问题只是"也像另一版" —— 原来这里一律写"跟你这份对不上"，
           等于把 98.5% 说成"对不上"（正是本波要防的假读数）。现在分开说。 */
        toast('info', '你选的「' + lockKey(baseName) + '」跟你这份**对得上**（' + (lk.readout || (lk.hits + '/' + lk.total + ' 条'))
            + '），可你这份也像是「' + ((lk.picks && lk.picks[1]) ? (lk.picks[0] && lk.picks[0].ver === lk.picks[1].ver ? (lk.picks[1].name || lk.picks[1].ver) : lk.picks[1].ver) : '另一版')
            + '」（两边都对得上）—— 还是不敢定"谁改的"（不猜）；下面照样逐条挑。');
    } else if (lk.verdict === 'UNCERTAIN') {
        toast('info', '你选的「' + lockKey(baseName) + '」跟你这份对得上 ' + lk.pct + '%（不到"能确定"的 75%）⇒ 还是判不了"谁改的"；下面照样逐条挑。');
    } else {
        const m = (lk.rows || []).filter(r => !r.error && Number(r.total) > 0)
            .sort((a, b) => Number(b.hits) - Number(a.hits))[0] || null;
        const near = (m && lockKey(m.name) !== lockKey(baseName)) ? (' · 最近的是「' + lockKey(m.name) + '」' + Math.round((Number(m.hitScore) || 0) * 100) + '%') : '';
        const stx = lk.readout || ((lk.total !== null && lk.total !== undefined) ? ('全量对得上 ' + lk.hits + '/' + lk.total + ' 条') : '这份读不出条目');
        toast('info', '你选的「' + lockKey(baseName) + '」跟你这份对不上（' + stx + near + '）⇒ 还是判不了"谁改的"；下面照样逐条挑。');
        if (prevBase && prevName === baseName && prevFrom === from) { /* 本来就是它，不用回退 */ }
    }
    return true;
}

/* ---------------------------------------------------------------- 手选控件的 HTML（唯一落点 #ywpu-lock-base） */

/** 下拉候选：`官方基准（云端）` / `本机已装` / `选文件…` 三组（plan §3.2③ 逐字）
 *  ★两个"版本名"口径不许混：机器键一律 `V0824`（verKeyOf），给人看的**两项都显示**：余温V0824（V0824） */
function lockPickOptions() {
    const skip = (S.mineFrom === 'preset' && S.mineName) ? String(S.mineName) : '';
    const local = listPresetNames()
        .filter(n => looksLikeBaseName(n) && String(n) !== skip)
        .map(n => ({ name: String(n), ver: verKeyOf(n) }));
    const cloud = (baseListCache || []).map(c => ({ name: c.ver, ver: c.ver, title: c.title || c.ver }));
    return { local, cloud };
}

/** 基准提示条 + 手选控件（渲染在 `#ywpu-foot` 的**第一行**里；见本节开头那段"界面落点"的说明）
 *  · 三状态都渲染：① 给读数 / ② 明说为什么不可靠 / ③ 明说 + 可选手选；
 *  · **手选永远可选**（§CY：默认自动认 + 认不出/校验不过才请他手选，且手选永远可选）；
 *  · 不填也能用（右侧灰字明写）。
 *  ★★Wave E2：整块**收纳进一个 `<details>`**（默认收起 = 一颗小药丸，点开才铺开）——
 *    改前 B2 是"常驻一整行"，实测把底栏顶出既有 KPI（手机 137 涨到 **283px**、占屏 33.5%；PC 83 涨到 152px；
 *    as2 评审 §U4 的验收线是**手机 ≤140px 且 ≤17%、PC ≈81px**）。收纳口径 = **重排，不砍功能**：
 *    文案 / 读数 / 手选下拉 / 一键 / "不填也行"**一个字都在**，只是要点一下才看；闭合态那行药丸
 *    用的是现成的 `…`（`.ywpu-adv` / `.ywpu-adv-body`）那套视觉语言 —— 不新造平行样式。
 *    ★手选控件**三状态都画**（含"① 对得上"）：plan §3.2③ ⒞ 要求"**反向也要能撤销**" ——
 *      对上了也允许用户改主意（下拉里选「（不指定）」⇒ 退回两方），否则一笔选错的基准按不掉。
 *    ★`#ywpu-lockbar`（= 这个 details 本身）、`.ywpu-lock-t`、`#ywpu-lock-base`、`.ywpu-lock-quick`
 *      这几个断言锚点**一个不少**（闭合态里 textContent 照样读得到）。 */
function lockBarHtml() {
    const lk = S.lock;
    if (!lk) return '';
    if (getSettings().baseLock === false) return '';                  // ★总开关关掉 = 整块不出现（一行回滚）
    const lit = lk.state === 'lit';
    const busy = S.lockBusy ? `<span class="ywpu-lock-busy">${esc(S.lockBusy)}</span>` : '';
    const quickPicks = (lk.picks || []).filter(p => p && p.ver).slice(0, 2);
    const quickDup = quickPicks.length === 2 && quickPicks[0].ver === quickPicks[1].ver;   // 同一版的两份副本 ⇒ 用名字区分
    const quick = quickPicks.map(p =>
        `<button class="ywpu-btn ywpu-mini ywpu-lock-quick" data-lock-pick="${esc(p.kind + '|' + p.name)}" title="按「${esc(p.ver)}」${quickDup ? '（' + esc(p.name) + '）' : ''}当基准重算（选完当场重算；不动你任何预设）">［${esc(quickDup ? (p.name || p.ver) : p.ver)}］</button>`).join('');
    const cur = lockKey(S.baseName || '');
    const { local, cloud } = lockPickOptions();
    /* ★Wave W2 ②（2026-09-24 · 作者第 20 批）：这颗药丸说两句话就得先知道"选没选基准、选的是哪一份"。
       · "已选"的判据 = `S.base || S.baseName`（手选 / 卡上声明取回 / 选文件 都算）；
       · 显示的名字 = "那一份预设的名字"：'preset'/'file' 直接用 `S.baseName`；
         而 'cloud' 的 `baseName` 是**版本键**（`V0824`）⇒ 拿云端清单里的 `title`（"余温V0824"）才是名字。 */
    const cloudTitle = (String(S.baseFrom) === 'cloud')
        ? String(((cloud || []).find(c => String(c.ver) === String(S.baseName)) || {}).title || '') : '';
    const baseLbl = String(cloudTitle || S.baseName || '').trim();
    const hasBase = !!(S.base || S.baseName);
    const cloudOpts = cloud.length
        ? '<optgroup label="官方基准（云端）">' + cloud.map(c =>
            `<option value="${esc('cloud|' + c.ver)}"${cur && cur === c.ver && String(S.baseFrom) === 'cloud' ? ' selected' : ''}>${esc(c.title)}（${esc(c.ver)}）</option>`).join('') + '</optgroup>'
        : '';
    const localOpts = local.length
        ? '<optgroup label="本机已装">' + local.map(o =>
            `<option value="${esc('preset|' + o.name)}"${cur && cur === o.ver && String(S.baseName) === o.name ? ' selected' : ''}>${esc(o.name)}（${esc(o.ver || '没版本号')}）</option>`).join('') + '</optgroup>'
        : '';
    /* ★Wave W2 ②（2026-09-24 · 作者第 20 批原话："点开了之后选择了基准 里边应该有一个取消，
       因为它现在点击某一个基准 它就选了某个基准，不能取消的"）⇒ **显式「取消」按钮**：
       · 只在**已经选了基准**时画（没选时它是个死按钮，作者要的是"选完能退回来"）；
       · 做的事与下拉里那个「（不指定：判不了"谁改的"）」**完全同一支**（`clearLockBase()`）—— 两处一个语义，
         区别只是这颗更显眼、点一下就中（下拉那条要展开列表才看得到，正是他说"取消不了"的原因）；
       · 位置：手选那一行里、紧跟「选文件…」之后（**不新起一行** —— 手机档底栏那行是 nowrap，多一行会顶 KPI）。 */
    const cancelBtn = hasBase
        ? '<button class="ywpu-btn ywpu-mini" id="ywpu-lock-clear" title="取消这笔基准：立刻退回两方对比（等于下拉里选「（不指定）」）★不动你任何预设">取消</button>'
        : '';
    const pick = `<span class="ywpu-lock-base" id="ywpu-lock-base">
        <select class="ywpu-input ywpu-lock-sel" id="ywpu-lock-sel" title="选一份官方旧版当基准：选完当场重算（不填也行：下面照样逐条挑）">
            <option value=""${cur ? '' : ' selected'}>（不指定：判不了"谁改的"）</option>
            ${cloudOpts}${localOpts}
            <option value="file|">选文件…</option>
        </select>
        <button class="ywpu-btn ywpu-mini" id="ywpu-lock-file" title="从本机选一份旧版预设文件当基准（当场重算）">选文件…</button>
        ${cancelBtn}
        <input type="file" id="ywpu-lock-input" accept=".json,application/json" style="display:none">
        <span class="ywpu-lock-tip">不填也行：下面照样逐条挑、另存成新预设，不动你现在这份。</span>
    </span>`;
    /* 闭合态那颗小药丸说什么（**不许出现"假读数"**）：
       · 正在问云端 / 问完之前（`lockPending`）⇒ 照实说"不能说死"，别印一句可能被翻掉的话；
       · ★Wave W2 ②（2026-09-24 · 作者第 20 批原话）：**未选基准 ⇒ 黄药丸「让显示更精确 点此选基准」**；
         **已选基准 ⇒ 绿药丸「基准：<预设名字>」**（原名口径 = 那一份预设的名字；云端候选拿它的 `title` 兜底）。
         "已选"的判据 = `S.base || S.baseName`（手选 / 卡上声明取回 / 选文件 都算）——
         ★作者要的是"选了就绿"，所以这里**不再要求"校验通过才显示"**；"判没判得出谁改的"照旧由
         展开区那句 `lk.text` 与底栏 `statLine` 说实话（那两处**一个字没改**）。
       ★窄屏（`narrow`）：只留给"正在核对基准"那一档（它本来就是短句）；未选/已选两档**全平台同一句口径**
         （作者逐字给了文案，不另造一版）—— 药丸本身是 `max-width:100% + ellipsis`，挤不下只会缩省略，
         不会把底栏顶出第二行（手机档底栏 KPI 见报告"底栏按场景"那节）。 */
    const narrow = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
        ? window.matchMedia('(max-width: 720px)').matches : false;
    /* ★★窄屏为什么要换一版短话（**实测出来的**，不是拍脑袋）：底栏第一行在 390 宽上给这颗药丸的位置只有 ≈80px，
       装不下它就整颗落到第二行 ⇒ 底栏 137px → **170px**（`as2 §U4` 的手机线是 ≤140px）。
       同一颗药丸、同一次会话里逐档 A/B（读数见 `e2e/tmp/w2-probe-mobile.log` 的"文案长度 → 底栏"那行）：
         `让显示更精确 点此选基准` 142px ⇒ 底栏 **170** ｜ `点此选基准` 73px ⇒ **137** ✓
         `基准：V0824` 83px ⇒ **170** ｜ `基准 V0824` 75px ⇒ 137（贴边，只有 3px 余量）｜ `已选基准` 62px ⇒ **137** ✓
       ⇒ 窄屏取**有余量**的那一档：未选说**动作**（`点此选基准`）、已选说**状态**（`已选基准`，绿）。
         真名字/真版本在**面板里**（下拉就是它，点一下就到），PC 档则逐字按作者的话显示。
       ★这是"作者逐字文案"与"手机底栏 KPI（≤140px）"之间的取舍 —— 已写进报告"待作者拍板"。 */
    const sum = S.lockPending ? (narrow ? '… 正在核对基准' : '… 正在核对基准（本机那几版还不能确定）')
        : (hasBase ? (narrow ? '已选基准' : ('基准：' + (baseLbl || '已选')))
            : (narrow ? '点此选基准' : '让显示更精确 点此选基准'));
    /* ★Wave K1（2026-09-24 · 作者第 19 批第 2/3 条）：**面板改成浮层（tray），药丸原地不动**。
       改前（Wave E2 版）：`[open]` 时整块 `flex: 1 1 100%` ⇒ 它从"第一行右边那颗药丸"变成"底栏里新的一整行块"
       ⇒ **药丸自己挪了位置**（实测 dx/dy 见 `e2e/tmp/waveK1-before-pc.log`）⇒ 用户在**同一个位置**再点一下
       点到的已经不是药丸了（作者原话："再点一下收不起来、位置还会跑，要移到别处才能收"）。
       改后：药丸**一个像素都不动**（收起/展开都在第一行同一个位置；展开只换一圈强调色），
       正文折进 `.ywpu-lockbody`（`position: absolute; bottom: 100%` 浮在底栏**上方**，
       与 `.ywpu-adv-body` 同一套视觉语言）⇒ ① 点两次同一处 = 开 → 收；② 底栏高度**展开也不涨**。
       ★`.ywpu-lock-quick` / `.ywpu-lock-t` / `#ywpu-lock-base` / `#ywpu-lock-sel` / `#ywpu-lock-file`
         这几个断言锚点一个不少（都还在，只是换了一层父节点）；`.ywpu-note` / `.ywpu-footstat`
         **一个都不许往这块里加**（r9h ③ 按它们数"底栏 chrome ≤2 行"，加了就红）。
       ★★Wave W2 ②（2026-09-24）：**记住"面板开着"这一件事**（`S.lockOpen`）——
         改前每次 `renderFoot()` 都会把这块**重建成收起态**，而"选完基准"正好就会触发一次重绘
         ⇒ 用户点一下［V0824］/下拉选一份，面板**自己就合上了**，那颗新加的「取消」按钮根本够不着
         （作者报的正是"选了就不能取消"）。现在：开着就是开着，直到用户自己把药丸再点一下收起。 */
    const openAttr = S.lockOpen ? ' open' : '';
    const quickRow = (quick || busy) ? `<div class="ywpu-lock-acts">
        ${quickPicks.length ? '<span class="ywpu-lock-lb">按这一版重算：</span>' : ''}${quick}${busy}
    </div>` : '';
    return `<details class="ywpu-lockbar${lit ? ' ywpu-lock-ok' : ''}" id="ywpu-lockbar"${openAttr}>
    <summary class="ywpu-lock-sum${hasBase ? ' ywpu-lock-has' : ' ywpu-lock-ask'}" title="${esc(lk.text)}">${esc(sum)}</summary>
    <div class="ywpu-lockbody">
        <div class="ywpu-lock-h"><b>基准</b><span class="ywpu-lock-hint">只用来判"这条差异是谁改的"，不影响缝入本身</span></div>
        <div class="ywpu-lock-t" title="${esc(lk.text)}">${esc(lk.text)}</div>
        ${quickRow}
        ${pick}
    </div>
</details>`;
}

/** 基准提示条上的交互（每次重画都重新绑；`renderFoot` 里调）
 *  · 下拉 / ［V0824］/ 选文件… **三颗都走 applyLockChoice**（当场重算 + 记住）；
 *  · 下拉里那个 `（不指定）` ⇒ `clearLockBase()`（**反向也要能撤销**：退回两方，别留按不掉的残留）；
 *  · ★Wave W2 ②：面板里那颗显式「取消」**走同一支 `clearLockBase()`**（同一个语义，只是更好找）；
 *  · 选文件走隐藏 input（iOS/桌面一致，不弹第二个窗）。 */
function bindLockBar(host) {
    const h = host || $el('#ywpu-lockbar');
    if (!h) return;
    /* ★Wave W2 ②：记住"面板开着"（`S.lockOpen`）—— 每次 `renderFoot()` 重建成收起态的话，
       "选完基准立刻想取消"这个动作够不着那颗按钮（见 `lockBarHtml` 里那段注释）。
       ★监听要挂在 **`<details>` 自己**身上（`toggle` 不冒泡）—— 传进来的 `host` 是底栏 `#ywpu-foot`，
         直接挂它会永远收不到（这一行就是为了这个）。 */
    const det = (h.id === 'ywpu-lockbar') ? h : h.querySelector('#ywpu-lockbar');
    if (det) det.addEventListener('toggle', () => { S.lockOpen = !!det.open; });
    /* ★Wave W2 ②：显式「取消」= 撤销这笔基准（与下拉里那条「（不指定）」同一个落点）。
       正在问云端（`S.lockBusy`）时不抢跑：那一路本来就会自己重画，抢了会两个状态打架。 */
    h.querySelector('#ywpu-lock-clear')?.addEventListener('click', () => {
        if (S.lockBusy) { toast('info', '正在核对基准，等这一下算完再取消（马上就好）'); return; }
        clearLockBase();
        toast('info', '基准已取消：退回两方对比（照样逐条挑、另存新预设；什么时候想再选一次都行）');
    });
    h.querySelector('#ywpu-lock-sel')?.addEventListener('change', async function () {
        const v = String(this.value || '');
        if (!v) { this.value = ''; clearLockBase(); return; }        // ★Wave E2：选「（不指定）」= 撤销这笔手选
        if (v.indexOf('file|') === 0) { $el('#ywpu-lock-input')?.click(); return; }
        const i = v.indexOf('|');
        await applyLockChoice(v.slice(0, i), v.slice(i + 1));
    });
    h.querySelector('#ywpu-lock-file')?.addEventListener('click', () => $el('#ywpu-lock-input')?.click());
    h.querySelector('#ywpu-lock-input')?.addEventListener('change', async function () {
        const f = this.files && this.files[0];
        this.value = '';
        if (!f) return;
        try {
            const obj = parseJsonLoose(await f.text());
            if (!PM.isValidPreset(obj)) { toast('warning', '这个文件不是一份对话补全预设（读不出条目）⇒ 它当不了基准。'); return; }
            await applyLockChoice('file', f.name, obj);
            toast('success', '基准文件：' + f.name + '（' + (obj.prompts || []).length + ' 条）');
        } catch (e) { toast('error', '读文件失败：' + ((e && e.message) || e)); }
    });
    h.querySelectorAll('[data-lock-pick]').forEach(b => b.addEventListener('click', () => {
        const v = String(b.getAttribute('data-lock-pick') || '');
        const i = v.indexOf('|');
        if (i < 0) return;
        applyLockChoice(v.slice(0, i), v.slice(i + 1));
    }));
}

/* ==== ywpu-lock-core:end ==== */

// ================================================================ 官方推送（P1）
//  作者侧：底栏「⬆ 导出更新包」——把「① 上一版原版 → ② 新版」的差量做成 ywp-patch 小文件发给用户。
//  用户侧：卡片上「📥 导入更新包文件」——选一个更新包 → 认版本（预设级指纹）→ 确认页逐条勾 → 应用并**另存新预设**。
//  铁律：不静默改用户预设（一律先确认、逐条可取消）；云端路径绝不覆盖同名；失败静默但 console.warn 留痕。

/** 从预设名里抠出版本号（"余温V0824" → "V0824"；抠不出就用原名）——更新包的 from/to 用它，人看得懂 */
function versionLabel(name) {
    const m = String(name || '').match(/[Vv](\d{3,4})/);
    if (m) return 'V' + m[1];
    return String(name || '').replace(/\.json$/i, '').trim() || '未命名';
}
const trunc = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? (t.slice(0, n) + '…') : t; };
/** 更新包 op → 人话标签（界面/提示都用它） */
const PATCH_TAG = { update: '改正文', add: '新增条目', remove: '删除条目', switch: '开关' };
const patchTagOf = (op) => (!op ? '' : (op.op === 'update' && op.rename ? '改名字' : (PATCH_TAG[op.op] || op.op)));

/** 作者侧：把 ①→② 的差量导成更新包并下载（① 必须是"上一版的官方原版"）
 *  ★S1-2（R9）：确认从 `window.confirm` 换成酒馆原生弹窗 → 这个函数跟着变成 async（调用处是 click 事件，不 await 也不影响）。 */
async function exportPatch() {
    if (S.busy) return;
    if (S.preview) { toast('info', '这是预览（伪缝入）：导出更新包（写你的下载目录）也不做，免得跟"预览什么都不会发生"混起来'); return; }
    if (!S.mine || !S.next) { toast('warning', '先用「① 你的预设」和「② 新版预设」各选一份预设'); return; }
    try {
        const from = versionLabel(S.mineName), to = versionLabel(S.nextName);
        const { pack, summary } = PM.patchPack({ mine: S.mine, next: S.next, from, to, createdAt: new Date().toISOString(), note: '' });
        const c = summary.counts;
        if (!pack.ops.length) { toast('info', '这两份一模一样，没有要发的东西'); return; }
        const okGo = await askYes('导出更新包', [
            '把「① ' + (S.mineName || '我的预设') + '」→「② ' + (S.nextName || '新版预设') + '」的差量做成更新包？',
            '',
            '· 改正文 ' + c.update + ' 处' + (c.rename ? '（其中改名字 ' + c.rename + ' 条）' : '') + ' · 新增 ' + c.add + ' 条',
            '· 删除 ' + c.remove + ' 条 · 开关 ' + c.switch + ' 条',
            '· 更新包不打包整份预设，只带"改了哪些地方"，很小',
            '',
            '★① 要放"上一版的**官方原版**"（不是你按自己习惯改过的那份），否则别人的预设对不上。',
            '',
            '确定后浏览器会下载一个 .json 文件，你把它发到群里/文件分享给用户即可。',
        ], { ok: '做成更新包', cancel: '算了' });
        if (!okGo) { toast('info', '好，这次不导出'); return; }
        const fname = '更新包-' + from + '→' + to + '-' + nowStamp() + '.json';
        if (!downloadJson(fname, pack)) { toast('error', '下载失败（浏览器把下载拦了？）'); return; }
        toast('success', '更新包已下载：这一版改了 ' + c.update + ' 处、新增 ' + c.add + ' 条（删 ' + c.remove + ' · 开关 ' + c.switch + '）');
        console.info('[预设更新器] 更新包已导出：' + fname, { ops: pack.ops.length, counts: c, KB: Math.round(JSON.stringify(pack).length / 1024) });
    } catch (e) {
        toast('error', '导出更新包失败：' + (e?.message || e));
        console.warn('[预设更新器] 导出更新包失败', e);
    }
}

/** 把一份**已经过版本判定**的包挂到确认页上（★P1 文件路 / P6 云端路**共用这一份**：都走 applyPatch + 同一个确认页）。
 *  干跑一遍拿到定位结果（置信度/冲突/找不到）—— applyPatch 是纯函数，不落盘，跑两遍结果一致。
 *  · mismatch / match 只是"给界面看的说明"，判定本身由调用方负责
 *  @returns {false|{ok:true, report:object}} */
function openPatchPage({ pack, match, mismatch, fileName, name }) {
    const ops = (pack.ops || []).filter(o => o && typeof o === 'object');
    if (!ops.length) { toast('info', '这个包里没有要改的地方'); return false; }
    let preview = null;
    try { preview = PM.applyPatch({ preset: S.mine, patch: { ...pack, ops }, decisions: {} }); }
    catch (e) { toast('error', '这个更新应用不了：' + (e?.message || e)); console.warn('[预设更新器] 更新包干跑失败', e, pack); return false; }
    S.patch = {
        fileName: String(fileName || ''), pack: { ...pack, ops },
        decisions: {},                    // key -> 'next'|'mine'|{use,customText}
        pick: {},                         // key -> { choices: {块号: 'mine'|'next'} }
        open: {},                         // key -> true（逐处挑展开）
        report: preview.report,           // 干跑的报告（冲突/低置信/找不到）
        baseCheck: preview.report.baseCheck,
        match: match || null,
        mismatch: mismatch || '',
        name: name || patchDefaultName(),
    };
    S.store = null;                       // ★P7：P1 文件路 / P6 云端路 = 自己的会话（别把"来自商店"那套带进来）
    // 默认全选（跟官方）——"你也改过"的那几条仍然默认用新的，但会被显眼标出来
    for (const op of ops) S.patch.decisions[op.key] = 'next';
    openPatchWindow();
    return { ok: true, report: preview.report };
}

/** 用户侧第 1 步：读一个更新包文件 → 认版本 → 开确认页（认不出就**跳过**，话说得别吓人） */
function acceptPatchFile(fileName, text) {
    let pack = null;
    try { pack = parseJsonLoose(text); }
    catch (e) { toast('error', '这个文件读不出来：' + e.message); return false; }
    if (!pack || pack.kind !== 'ywp-patch' || !Array.isArray(pack.ops)) {
        toast('error', '这不是一个「更新包」文件。（更新包是作者从预设更新器里导出的 .json；如果你下的是整份预设，请用「② 新版预设」那个入口）');
        return false;
    }
    if (!S.mine) { toast('warning', '先在「① 你的预设」里选你现在在用的那份'); return false; }
    const ops = pack.ops.filter(o => o && typeof o === 'object');
    if (!ops.length) { toast('info', '这个更新包里没有要改的地方'); return false; }
    const m = PM.matchPresetVersion(S.mine, pack.baseFingerprint, { minSampleScore: 0.6 });
    console.info('[预设更新器] 更新包版本判定', { 包: pack.from + '→' + pack.to, ok: m.ok, ...m });
    /* ★Wave B2 ④（plan §10 拍板 6 / §3.3.3 的"顺带受益"那一格）：**本轮只把新证据显示出来、不改硬门禁**。
       内核那边 pack 的 `baseFingerprint` 已经升成全量档（带 `entryHashes` + `digest`，B1 交活）⇒
       **同一个调用点**现在多读到 `hits/total/hitScore/digestSame`。B1 实测：
         · 该放行的（原样 V0811）⇒ 全量 132/132（100%）+ digestSame=true；
         · 该拦住的那份（V0811 被 V0824 的包放行）⇒ 读数从"看起来 100% 的 4/5"变成 **82% 且 digestSame=false**。
       ★为什么不在这一波拦（拦住 = 收紧硬门禁）：会动 3 套套件（run-updater-patch / preset-merge-test /
         商店那条 ywp-patch 卡）⇒ plan §10 拍板 6 已判"单独立项"。
       ★若将来要拦，改的就是**紧挨着下面那一行**（`if (!m.ok)` 之前插一句）：
         `if (m.full && !m.degraded && !m.digestSame && Number(m.hitScore) < 0.9) { 同上的人话 + return false; }`
         —— 参考读数：放行 97% vs 该拦的 82%，卡在 0.9 是个**策略数字**，不该写死在内核里（B1 的结论）。 */
    const fullRead = (m && m.full && !m.degraded)
        ? ('全量对得上 ' + m.hits + '/' + m.total + ' 条（' + Math.round((Number(m.hitScore) || 0) * 100) + '%）· 整版摘要' + (m.digestSame ? '一致（逐条逐字没动过）' : '不一致'))
        : '（这个包没带全量指纹：按抽样那档判的）';
    console.info('[预设更新器] 更新包版本判定（全量档读数）', { 包: pack.from + '→' + pack.to, 读数: fullRead });
    if (!m.ok) {
        toast('info', '没检测到对应的版本 —— 这个包是从「' + (pack.from || '上一版') + '」改到「' + (pack.to || '新版') + '」的，'
            + '跟你现在选的这份对不上（' + m.reasons.slice(0, 2).join('；') + '）。先帮你停下，不往你的预设里写东西。');
        return false;
    }
    const st = getSettings();
    const mismatch = (st.appliedOfficial && pack.from && st.appliedOfficial !== pack.from)
        ? ('你记录里上次应用的是「' + st.appliedOfficial + '」，这个包是从「' + pack.from + '」改起的 —— 中间可能少了几个包（按顺序一个个来更稳）。') : '';
    const r = openPatchPage({ pack, match: m, mismatch, fileName: String(fileName || ''), name: patchDefaultName() });
    if (!r) return false;
    const rep = r.report;
    toast('success', '更新包认出来了（' + (pack.from || '?') + ' → ' + (pack.to || '?') + '）：'
        + '改 ' + rep.summary.update + ' 处 · 新增 ' + rep.summary.add + ' 条 · 删除 ' + rep.summary.remove + ' 条 · 开关 ' + rep.summary.switch + ' 条'
        + '（该改哪些地方在下面，你逐条确认）');
    return true;
}

/** 新预设的默认名字：原名（更新 2026-09-20）——★绝不覆盖同名 */
function patchDefaultName() {
    const base = String(S.mineName || getSettings().lastMineName || '预设').replace(/\.json$/i, '').replace(/（更新 \d{4}-\d{2}-\d{2}）$/, '');
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return base + '（更新 ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '）';
}

function closePatchWindow() {
    const h = $el('#ywpu-patch');
    if (h) h.classList.remove('ywpu-open');
}

function openPatchWindow() {
    let host = $el('#ywpu-patch');
    if (!host) {
        host = document.createElement('div');
        host.id = 'ywpu-patch';
        host.innerHTML = '<div id="ywpu-patch-card"><div id="ywpu-patch-head"></div><div id="ywpu-patch-body"></div><div id="ywpu-patch-foot"></div></div>';
        document.body.appendChild(host);
        applyColors();                                    // 新窗口也要穿上用户选的颜色
        // ★只有「关闭」关（作者："所有弹出的界面都必须手点 ✕ 才关"）：遮罩点击不再关 + Esc 不再关 + 挡 ST 的抽屉收起
        guardOverlay(host);
    }
    host.classList.add('ywpu-open');
    renderPatchWindow();
}

/** 逐处挑：把"你的正文 / 官方新文"按块列出来（内核 diffBlocks，跟条目页同一套算法） */
function patchBlocksOf(key) {
    const P = S.patch;
    if (!P) return null;
    const c = (P.report.conflicts || []).find(x => String(x.key) === String(key));
    if (!c) return null;
    const blocks = PM.diffBlocks(String(c.你的 || ''), String(c.官方新文 || ''));
    return { conflict: c, blocks };
}

/** 逐处挑当前拼出来的正文（没点的处按"用新的"垫着，界面上会显示还差几处） */
function patchCustomText(key) {
    const b = patchBlocksOf(key);
    if (!b) return '';
    const choices = (S.patch.pick[key] || {}).choices || {};
    return PM.assembleFromBlocks(b.blocks, choices, 'next');
}

function setPatchDecision(key, use, customText) {
    const P = S.patch;
    if (!P) return;
    if (use === 'custom') P.decisions[key] = { use: 'custom', customText: String(customText ?? '') };
    else P.decisions[key] = (use === 'mine' ? 'mine' : 'next');
}

const patchPosQ = (box, sel) => {
    const all = [...sel.querySelectorAll('option')].map(x => ({ v: x.value, t: x.textContent }));
    const q = box.querySelector('[data-posq]');
    if (!q) return;
    q.oninput = () => {
        const kw = q.value.trim().toLowerCase();
        const keep = sel.value;
        sel.innerHTML = all.filter(x => !kw || !x.v || x.t.toLowerCase().includes(kw))
            .map(x => `<option value="${esc(x.v)}">${esc(x.t)}</option>`).join('');
        if ([...sel.options].some(x => x.value === keep)) sel.value = keep;
        if (kw && sel.options.length === 2) sel.selectedIndex = 1;
    };
};

/** ★§22（P1 文件路 / P6 云端路）：这条新增条目在你这儿**找不到该插在哪** → 让用户**直接指定**"插在谁后面"。
 *  跟商店路不同：这里改的是**这条 op 的 `place`** —— 内核 `resolveAnchor` 第 3 级按 `place.after`（名字）
 *  一命中就 90 分插在它后面；改完**重跑一遍干跑**（`applyPatch` 是纯函数、不落盘）→ 报告与位置立刻跟着变。
 *  ★只留"锚点那条的名字"：作者那份的 `afterId` / `afterText` 在你这儿本来就是对不上的东西，留着反而可能误配。 */
function patchPickAnchor(key, name) {
    const P = S.patch;
    if (!P) return false;
    const op = (P.pack.ops || []).find(o => String(o.key) === String(key));
    if (!op) return false;
    const nm = String(name || '');
    if (!nm) { op.place = {}; toast('info', '已还原成"按内核自己判"'); }
    else { op.place = { after: nm }; toast('success', '位置改好了：这条会插在 ' + nm + '后面'); }
    try {
        const preview = PM.applyPatch({ preset: S.mine, patch: P.pack, decisions: {} });
        P.report = preview.report;
        const rec = (P.report.ops || []).find(x => String(x.key) === String(key));
        console.info('[预设更新器] 手动指定位置（更新包路）', { 条目: op.name, 插在谁后面: nm || '（还原）', 判据: rec ? rec.how : '', 置信: rec ? rec.conf : null });
    } catch (e) {
        toast('error', '重算位置失败：' + (e?.message || e));
        console.warn('[预设更新器] 手动指定位置后重算失败', e);
        return false;
    }
    renderPatchWindow();
    return true;
}

/** 那一行「插在你这儿的哪一条后面？」（下拉带搜索；选项 = **我这份预设**的顺序表条目名） */
function patchPosPickHtml(op, key, how) {
    const list = mineOrderEntries();
    if (!list.length) return '';
    const cur = (op.place && op.place.after) ? String(op.place.after) : '';
    return `<div class="ywpu-posprow" data-poskey="${esc(key)}">
        <span class="ywpu-pospick-t">插在你这儿的哪一条后面？</span>
        <input class="ywpu-input ywpu-posq" data-posq="1" placeholder="搜条目名…" title="在你这份预设里搜条目名，下面的下拉只剩匹配的">
        <select class="ywpu-input ywpu-poss" data-patchpos="1" data-opkey="${esc(key)}" title="选中即刻生效：这条新条目就插在你选的那条后面">
            <option value="">（不改：内核自己判 —— ${cur ? '上次你选的是 ' + esc(cur) : esc(how || '没认出锚点')}）</option>
            ${list.map(x => `<option value="${esc(x.name)}"${x.name === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
        </select>
    </div>`;
}

/** 一行 op（默认全选；也可以逐条取消） */
function patchRowHtml(op) {
    const P = S.patch;
    const key = String(op.key);
    const dec = P.decisions[key];
    const on = !(dec === 'mine');
    const c = (P.report.conflicts || []).find(x => String(x.key) === key);
    const low = (P.report.lowConf || []).find(x => String(x.key) === key);
    const un = (P.report.unresolved || []).find(x => String(x.key) === key);
    const same = (P.report.sameName || []).find(x => String(x.key) === key);
    // ★§22：新增条目 + 内核六级兜底全失败/锚点不在顺序表里（conf 0 / 60）→ 位置待定（内核把它放到了末尾）
    const pend = !!(op.op === 'add' && low && (Number(low.conf) === 0 || Number(low.conf) === 60));
    const isCustom = dec && typeof dec === 'object' && dec.use === 'custom';
    const use = isCustom ? 'custom' : (dec === 'mine' ? 'mine' : 'next');
    const pick = P.pick[key] || { choices: {} };
    const pb = patchBlocksOf(key);
    const prog = pb ? PM.pickProgress(pb.blocks, pick.choices) : null;
    const notes = [];
    if (un) notes.push('<span class="ywpu-ptag ywpu-ptag-warn">没找到这条</span>' + esc(un.why));
    if (pend) notes.push('<span class="ywpu-ptag ywpu-ptag-warn">位置待定</span>内核没认出该插在谁后面（' + esc(low.how) + '）—— 会在下面自己选一条，或者照它说的先放末尾');
    else if (low) notes.push('<span class="ywpu-ptag ywpu-ptag-warn">位置不太确定</span>' + esc(low.how) + '（置信 ' + low.conf + '）');
    if (same) notes.push('<span class="ywpu-ptag ywpu-ptag-warn">你已有一条同名</span>会照常新增一条，你自己删一个');
    const acts = c
        ? `<span class="ywpu-prow-acts">
             <!-- ★§BY-F：按"左旧右新"重排（改前是 用新的|用我的|逐处挑）—— data-pact 三个值一个没变，
                  只换顺序；"逐处挑"居中（= 条目行「逐处挑 / 保存为两版」那一档的位置口径）。 -->
             <button class="ywpu-btn ywpu-mini${use === 'mine' ? ' ywpu-on' : ''}" data-pact="mine" data-opkey="${esc(key)}" title="保留你自己的（官方这条不动）">用我的</button>
             <button class="ywpu-btn ywpu-mini${use === 'custom' ? ' ywpu-on' : ''}" data-pact="pick" data-opkey="${esc(key)}" title="一处一处挑：哪些用你的、哪些用新的">逐处挑${prog ? ' ' + (prog.total - prog.left) + '/' + prog.total : ''}</button>
             <button class="ywpu-btn ywpu-mini${use === 'next' ? ' ywpu-on' : ''}" data-pact="next" data-opkey="${esc(key)}" title="用官方这次改成的样子">用新的</button>
           </span>`
        : '';
    const pickHtml = (isCustom || P.open[key]) && pb
        ? `<div class="ywpu-prow-pick">
             ${prog ? `<div class="ywpu-prow-note">还有 ${prog.left} 处没选（没选的先按"用新的"）</div>` : ''}
             ${pb.blocks.filter(b => b.changed).map(b => {
            const ch = pick.choices[b.i];
            return `<div class="ywpu-pblock">
                   <div class="ywpu-prow-note">旧：${esc(trunc((b.mine || []).join(' '), 70))}</div>
                   <div class="ywpu-prow-note">新：${esc(trunc((b.next || []).join(' '), 70))}</div>
                   <span class="ywpu-prow-acts">
                       <button class="ywpu-btn ywpu-mini${ch === 'mine' ? ' ywpu-on' : ''}" data-pact="block" data-opkey="${esc(key)}" data-block="${b.i}" data-side="mine">这一处用我的</button>
                       <button class="ywpu-btn ywpu-mini${ch === 'next' ? ' ywpu-on' : ''}" data-pact="block" data-opkey="${esc(key)}" data-block="${b.i}" data-side="next">这一处用新的</button>
                   </span>
               </div>`;
        }).join('')}
           </div>`
        : '';
    return `<div class="ywpu-prow${on ? '' : ' ywpu-offrow'}${c ? ' ywpu-prow-conf' : ''}" data-opkey="${esc(key)}">
        <input type="checkbox" class="ywpu-ocheck" data-pact="toggle" data-opkey="${esc(key)}" ${on ? 'checked' : ''} title="不想要这一条就取消勾选">
        <span class="ywpu-ptag ywpu-ptag-${esc(op.op)}">${esc(patchTagOf(op))}</span>
        <span class="ywpu-prow-name">${esc(op.name || '(未命名)')}</span>
        ${c ? '<span class="ywpu-ptag ywpu-ptag-conf">你也改过</span>' : ''}
        ${notes.length ? `<span class="ywpu-prow-note">${notes.join(' · ')}</span>` : ''}
        ${acts}
        ${pickHtml}
        ${pend ? patchPosPickHtml(op, key, low && low.how) : ''}
    </div>`;
}

function renderPatchWindow() {
    const P = S.patch;
    if (!P) return;
    const layout = $el('#ywpu-patch-body'); if (!layout) return;
    const keep = layout.scrollTop;                        // ★重绘不许让滚动跳掉
    const r = P.report;
    const ops = P.pack.ops;
    const nOn = ops.filter(o => !(P.decisions[String(o.key)] === 'mine')).length;
    $el('#ywpu-patch-head').innerHTML = `<b>📥 预设更新：${esc(P.pack.from || '上一版')} → ${esc(P.pack.to || '新版')}</b>
        <span class="ywpu-sub">改了 ${r.summary.update} 处 · 新增 ${r.summary.add} 条 · 删除 ${r.summary.remove} 条 · 开关 ${r.summary.switch} 条</span>
        <span class="ywpu-flex"><button class="ywpu-btn ywpu-mini" id="ywpu-patch-close">关闭</button></span>`;
    const notes = [];
    if (P.mismatch) notes.push('⚠ ' + esc(P.mismatch));
    if (P.baseCheck && !P.baseCheck.match && P.baseCheck.hint) notes.push('ℹ ' + esc(P.baseCheck.hint));
    /* ★Wave B2 ④（plan §10 拍板 6 / §3.3.3「顺带受益」那一格）：**只把新证据显示出来、不改硬门禁**。
       内核那边 pack 的 `baseFingerprint` 已经升成全量档（带 `entryHashes` + `digest`，B1 交活）⇒
       **同一个调用点**现在多读到 `hits/total/hitScore/digestSame`。B1 实测：该放行的 = 100% + digestSame；
       该拦住的那份（V0811 被 V0824 的包放行）读数从"看起来 100% 的 4/5"变成 **82% 且 digestSame=false**。
       把这两条读数摆在确认页上 ⇒ 用户/作者一眼能看出"这个包其实不像你手上这份"（正文一个字没多写）。
       ★将来要真拦住：改的是 `acceptPatchFile` 里 `if (!m.ok)` **之前**那一行（见那儿的注释），
         不是一个策略数字写死在这儿。老包（没有 entryHashes）⇒ `mm.full` 为假 ⇒ 这一行不出现（零回归）。 */
    const mm = P.match;
    if (mm && mm.full && !mm.degraded) {
        notes.push('ℹ 版本核对（全量档）：全量对得上 ' + mm.hits + '/' + mm.total + ' 条（' + Math.round((Number(mm.hitScore) || 0) * 100)
            + '%）· 整版摘要' + (mm.digestSame ? '一致（逐条逐字、含顺序都没动过）' : '不一致（这个包或你手上这份被改过）'));
    }
    // ★§22：非余温预设（结构差得多 / 锚点整条找不到）→ 说清"从哪来的、为什么没找到位置"（不静默）
    const tro = anchorTrouble();
    for (const l of tro.lines) notes.push(esc(l));
    if (r.unresolved.length) notes.push('ℹ 有 ' + r.unresolved.length + ' 条在你这份里找不到（会跳过，勾了也不动）');
    /* ★W95 ①（作者原话："怎么点进去是一个重复的话？"—— 同一条"位置不太确定"在这块里说两遍）：
       `tro.lines` 现在**自己就带**那一句（`anchorTrouble()` 的 ③ 把它并进去了），所以这里不能再无条件补 ——
       否则"⚠ 有 1 条的位置不太确定…"（来自 tro.lines）+ "ℹ 有 1 条的位置不太确定…"（本地这行）两句话在
       同一个块里并排出现。判据：`tro.lines` 里已经说过"位置不太确定"就**不补**；
       其它情况（例如将来 lowConf 不再进 lines）照旧兜底 —— 这条提示一个字都没被删掉，只是不再说第二遍。 */
    if (r.lowConf.length && !tro.pending.length && !tro.lines.some(x => /位置不太确定/.test(String(x)))) {
        notes.push('ℹ 有 ' + r.lowConf.length + ' 条的位置不太确定（放在哪儿可能不准，生成后可以去总览页拖）');
    }
    layout.innerHTML = `
<div class="ywpu-box">
    ${sourceBarHtml()}
    ${notes.length ? `<div class="ywpu-row"><span class="ywpu-note">${notes.join('<br>')}</span></div>` : ''}
    <div class="ywpu-row">
        <span class="ywpu-flex">
            <button class="ywpu-btn ywpu-mini" id="ywpu-patch-all">全选（${ops.length}）</button>
            <button class="ywpu-btn ywpu-mini" id="ywpu-patch-none">全不选</button>
        </span>
        <span class="ywpu-note">已选 <b>${nOn}</b> / ${ops.length} 条</span>
    </div>
</div>
<div class="ywpu-patchbox">${ops.map(op => patchRowHtml(op)).join('')}</div>`;
    $el('#ywpu-patch-foot').innerHTML = `
<div class="ywpu-footline">
    <span class="ywpu-footbtns">
        <input class="ywpu-input ywpu-namein" id="ywpu-patch-name" value="${esc(P.name)}" title="新预设的名字（绝不覆盖同名：重名会自动加 (2)）">
        <span class="ywpu-btngroup"><button class="ywpu-btn ywpu-primary" id="ywpu-patch-apply"${S.preview ? ' disabled' : ''} title="${S.preview ? '预览（伪缝入）：不会写盘' : '另存成一份新预设'}">应用并生成新预设${S.preview ? '（预览）' : ''}</button></span>
    </span>
</div>`;
    $el('#ywpu-patch-close').addEventListener('click', () => closePatchWindow());
    $el('#ywpu-patch-all').addEventListener('click', () => { for (const o of ops) S.patch.decisions[String(o.key)] = 'next'; renderPatchWindow(); });
    $el('#ywpu-patch-none').addEventListener('click', () => { for (const o of ops) S.patch.decisions[String(o.key)] = 'mine'; renderPatchWindow(); });
    $el('#ywpu-patch-name').addEventListener('input', function () { S.patch.name = this.value; });
    $el('#ywpu-patch-apply').addEventListener('click', () => applyPatchAndSave());
    // ★§22：位置待定那几行里的「插在你这儿的哪一条后面？」（下拉 + 搜索；选中即刻生效 → 重跑干跑 + 重绘）
    layout.querySelectorAll('.ywpu-posprow').forEach(box => {
        const sel = box.querySelector('[data-patchpos]');
        if (!sel) return;
        patchPosQ(box, sel);
        sel.onchange = () => { patchPickAnchor(box.getAttribute('data-poskey'), sel.value); };
    });
    // 行内操作：勾选框 / 用新的·用我的·逐处挑 / 逐处的两个小按钮（事件委托，绑一次）
    const box = $el('.ywpu-patchbox');
    if (box) box.onclick = (ev) => {
        const t = ev.target.closest('[data-pact]');
        if (!t) return;
        const act = t.getAttribute('data-pact'), key = t.getAttribute('data-opkey');
        if (!key) return;
        ev.preventDefault();
        if (act === 'toggle') {
            setPatchDecision(key, t.checked ? 'next' : 'mine');
            renderPatchWindow();
        } else if (act === 'next' || act === 'mine') {
            S.patch.open[key] = false;
            setPatchDecision(key, act);
            renderPatchWindow();
        } else if (act === 'pick') {
            S.patch.open[key] = !S.patch.open[key];
            if (!S.patch.pick[key]) S.patch.pick[key] = { choices: {} };
            setPatchDecision(key, 'custom', patchCustomText(key));
            renderPatchWindow();
        } else if (act === 'block') {
            const i = Number(t.getAttribute('data-block'));
            const side = t.getAttribute('data-side') === 'mine' ? 'mine' : 'next';
            const slot = S.patch.pick[key] || (S.patch.pick[key] = { choices: {} });
            if (slot.choices[i] === side) delete slot.choices[i]; else slot.choices[i] = side;   // 再点一次 = 取消这一处
            setPatchDecision(key, 'custom', patchCustomText(key));
            renderPatchWindow();
        }
    };
    layout.scrollTop = keep;
    applyAutoInkAll();                              // ★R7：补丁确认页重绘后过一遍兜底
}

/** 用户侧最后一步：应用 → 写盘（★绝不覆盖同名：重名自动加 (2)；写的是新预设，不动他现在这份） */
async function applyPatchAndSave() {
    const P = S.patch;
    if (!P || S.busy) return;
    if (S.preview) { toast('info', '这是预览（伪缝入）：不会真的写盘'); return; }   // ★M11：写盘口兜底
    const typed = ($el('#ywpu-patch-name')?.value || P.name || '').trim();
    P.name = typed;
    if (!typed) { toast('warning', '给新预设起个名字'); return; }
    const names = listPresetNames();
    let final = typed, n = 2;
    while (names.includes(final)) { final = typed + '（' + n + '）'; n++; }     // ← 云端路径绝不覆盖同名
    try {
        S.busy = true;
        const { preset, report } = PM.applyPatch({ preset: S.mine, patch: P.pack, decisions: P.decisions });
        const u = (report.unresolved || []).length;
        // ★S1-2：window.confirm → 酒馆原生弹窗；取消补一句 toast
        const okGo = await askYes('应用更新包', [
            '把更新包应用到「' + (S.mineName || '你的预设') + '」，另存成新预设：',
            '',
            '「' + final + '」' + (final !== typed ? '（本来想叫「' + typed + '」，已经有同名的了，所以没覆盖它）' : ''),
            '',
            '· 改了 ' + report.summary.update + ' 条 · 新增 ' + report.summary.add + ' 条 · 删除 ' + report.summary.remove + ' 条 · 开关 ' + report.summary.switch + ' 条',
            (report.summary.kept ? '· 你选了"用我的" ' + report.summary.kept + ' 条（官方那些不动你的）' : ''),
            (u ? '· ' + u + ' 条没找到位置，跳过了' : ''),
            (report.conflicts.length ? '· 其中 ' + report.conflicts.length + ' 条是你也改过的（按你上面挑的处理）' : ''),
            '',
            '你现在用的那份不会被改动，也不会覆盖任何同名预设。',
        ], { ok: '生成', cancel: '算了' });
        if (!okGo) { S.busy = false; toast('info', '好，这次不生成 —— 你的预设一个字都没动'); return; }
        await savePreset(final, preset);
        // §5.3 的门禁：记下"已应用官方版本号"（下次检查更新时用它提示"跳代"，不靠内容 hash）
        const st = getSettings();
        st.appliedOfficial = String(P.pack.to || '');
        st.appliedOfficialAt = nowStamp();
        st.appliedOfficialFrom = final;
        saveSettings();
        S.lastSaved = final;
        // ★S1-5：同一句错文案（"到下拉里选它"）在这条路上也修掉 —— ST 保存后会当场切到新预设
        toast('success', '已生成「' + final + '」——' + savedWhereText(final, '（你原来那份没动，还在下拉里）'));
        console.info('[预设更新器] 更新包已应用', { 包: P.pack.from + '→' + P.pack.to, 存成: final, summary: report.summary, 冲突: report.conflicts.length, 找不到: u, 低置信: report.lowConf.length });
        closePatchWindow();
        S.patch = null;
        renderSource();
    } catch (e) {
        toast('error', '生成失败：' + (e?.message || e));
        console.warn('[预设更新器] 应用更新包失败', e);
    } finally {
        S.busy = false;
    }
}

// ================================================================ 三、P6「三槽位云端自动更新」—— ★已下线（2026-09-23 · 台账 §CY）
// 作者原话："可以删 取回作者的改动并对比 这个功能"。下线的是**整条「从云端取回作者最新整份」**的路：
//   · 卡片上那颗「⬇ 取回作者的改动并对比」按钮（原 330 行）与它的 click 绑定（原 352 行）；
//   · __ywpu 调试出口里的 cloud 块（原 397-406）、__ywUpdaterCloud 上的 run / state（原 471-472）；
//   · 这一族运行时（原 5353-5626）：CLOUD 状态机 / cloudApi / cloudVer / cloudVerNo / cloudLoadOfficials /
//     cloudIdentify / cloudModCount / cloudPackDegrade / cloudBuildPack / cloudSlotsHtml / cloudSwitchBase /
//     cloudMineNote / checkCloudUpdate；
//   · 更新包确认页那条链上的接线（原 1592-1599 / 1707-1711 / 4979 / 4981 / 4997 / 5028 / 5211-5214 / 5244-5246）。
// 原实现**逐字留档**在 preset-updater-cloud.removed.js（每段带原行号 + sha256 + 逐步恢复说明）。
// ★保留下来的（别当孤儿删掉）：
//   · cloudPickMine()（下方）—— 商店路 openStorePack 在用它挑"缝进哪一份"；原名保留，
//     因为 preset-store.js 的注释也认这个名字（改名要动两个文件，本班只删不重构）；
//   · currentPresetName()（下方）—— 被 cloudPickMine 调；
//   · versionLabel()（本文件别处）—— 更新包文件路的 from / to 用它；
//   · window.__ywUpdaterCloud.openStore / openStorePseudo / openStoreBatch —— 商店路三个入口；
//   · 「📥 导入更新包文件」那条离线路 —— 跟云端无关，一个字没动。
// 现在"认你基于哪一版"由**手动**的 ③ 官方旧版那条路承担（本文件上方三槽位区）；
// 没基准时照样两方对照、逐条挑、另存成新预设（不缺任何"能干活"的能力）。

/** 酒馆**当前正在用**的那份预设名（§14.1 ② 的默认值：用户不用先去选，点开就是他手上这份） */
function currentPresetName() {
    try {
        const pm = presetManager();
        if (pm && typeof pm.getSelectedPresetName === 'function') {
            const n = pm.getSelectedPresetName();
            if (n) return String(n);
        }
    } catch (e) { console.warn('[预设更新器] 取当前预设名失败', e); }
    const names = listPresetNames();
    return names[0] || '';
}

/** ② 你现在这份（真正参与计算的是它）：商店页传来的"缝到哪一份" → 更新器里已选的 ① → 酒馆当前预设
 *  ★W19A ①（作者第 24 批 ① 的真现场）：改前第一句是
 *    `if (S.mine && S.mineName === hintName) return { preset: S.mine, name: S.mineName };`
 *    —— **名字一样就直接用旧快照**。作者的操作正是这条：缝过一次 → 回酒馆把这份预设改了 →
 *    再点一次「缝入」⇒ 命中这一行 ⇒ 对比的还是那次缝之前的旧内容
 *    （原话："然后再点击一次那个缝入 然后在里面就完全没有能够对比出我刚才有自行修改的那个地方"）。
 *    现在：名字相同时也**先按盘上现在那份重读**（`rereadSlot`，判据 = 内核内容摘要），
 *    内容真变了就换掉 + 留一条 console 读数（界面提示交给调用方，别在商店路上连喷 toast）。 */
function cloudPickMine(hintName) {
    const names = listPresetNames();
    if (hintName && names.includes(hintName)) {
        if (S.mine && S.mineName === hintName) {
            const r = rereadSlot('mine');
            if (r.ok && r.changed) {
                console.info('[预设更新器] 商店这次缝入前重读了 ①（内容跟手上的快照不一样）',
                    { 名字: hintName, 条目数: (S.mine && S.mine.prompts || []).length, 摘要: presetDigestTag(S.mine) });
            }
            return { preset: S.mine, name: S.mineName };
        }
        try { if (acceptPreset(readPreset(hintName), 'mine', hintName, 'preset')) return { preset: S.mine, name: S.mineName }; }
        catch (e) { console.warn('[预设更新器] 读不到预设「' + hintName + '」', e); }
    }
    if (S.mine && PM.isValidPreset(S.mine)) {
        /* ★W19A ①：这条兜底路（没给"缝到哪一份"/那个名字不在清单里）拿的也是 S.mine ⇒ 同样先对齐一次。 */
        const r = rereadSlot('mine');
        if (r.ok && r.changed) {
            console.info('[预设更新器] 商店这次缝入前重读了 ①（内容跟手上的快照不一样）',
                { 名字: S.mineName, 条目数: (S.mine && S.mine.prompts || []).length, 摘要: presetDigestTag(S.mine) });
        }
        return { preset: S.mine, name: S.mineName };
    }
    const cur = currentPresetName();
    if (!cur) return null;
    try { if (acceptPreset(readPreset(cur), 'mine', cur, 'preset')) return { preset: S.mine, name: S.mineName }; }
    catch (e) { console.warn('[预设更新器] 读不到当前预设「' + cur + '」', e); }
    return null;
}

// ================================================================ P7 商店 → 更新器（定稿方案 §15，2026-09-20 用户要求）
// 用户原话："我点开某一项之后，它直接在这里选择用新版/保持我的/逐处挑，**为什么不能和下面的预设更新器联动呢？
//   在预设更新器里面进行操作不行吗？**省得你现在做的这个不伦不类、很多功能都没有……要不然下面那个预设更新器不是白做了吗？"
// 定稿（唯一一条路）：**商店只负责"挑包 + 挑缝进哪一份"，"缝"这个动作一律跳更新器完整的对比页** ——
//   · A = 你手上这份（商店页"缝进哪一份"选的那份；没选就退到酒馆当前预设）
//   · B = 用内核把包**应用**成的一份临时新版（★全程不落盘、绝不改你现有的任何预设）
//   · 用户在熟的那套界面里随便挑（逐条三选项 / 逐处挑 / 顺序页 / 开关 / 批量 / 筛选有变化的）→「生成新预设」= **另存新名**
// 三种包各走最稳的一条（§15 第 1 条）：
//   · ywp-patch  → 它本来就是 op 列表：内核 `applyPatch()`（= P1 文件路 / P6 云端路**同一个函数**）
//   · ywp-entry  → 把作者的条目转成同样的 op（改=update / 新=add，锚点六级兜底仍在内核里）再 `applyPatch()`
//   · ywp-preset → 整份直接当 B（§4.3"丢进现有对比流程当新版"；"只有我有"的条目在对比页里由用户自己挑，**不静默删**）
// 铁律：**不覆盖同名**（S.store 一置上，doGenerate 就自动加序号）；包应用不了 → 人话 + console.warn（不静默）。

/* ==== ywpu-store-core:start ==== */   // ★这一段会被 e2e/tmp/probe-stitch-anchor.js 按标记抽出来真编译（口径 = 真实产品代码）
/** 商店的包 → `ywp-patch`（op 列表）。只有 ywp-patch / ywp-entry 走它（ywp-preset 整份不走 op）。
 *  ★同名处理（P7 保留商店那条老能力）：作者给的"新增条目"如果**你手上已经有同名的**，
 *    就当成 **update（改你那条）** 进对比页 —— 你在那儿可以选 用我的 / 用新版 / 保存为两版 / 逐处挑；
 *    不再"凭空多插一条同名"（ST 里两条同名会被**各注入一次**，是坑），要两条就点「保存为两版」。
 *  @returns {{patch:object, sameName:Array}} */
function storePackToPatch(pack, mine) {
    const kind = String((pack && pack.kind) || '');
    const have = new Set();
    try { for (const e of PM.indexPreset(mine).entries) have.add(PM.normalizeName(e.name)); } catch (e) { /* 读不了就当"没有同名" */ }
    const sameName = [];
    const conv = (e, i) => {
        if (!e || typeof e !== 'object') return null;
        const nm = String((e.entry && e.entry.name) || e.name || '');
        let mode = e.mode === 'patch' ? 'update' : (e.mode === 'remove' ? 'remove' : 'add');
        // 同名 → 按"改你那条"（★名字为空的不算，空名字定位不到，交给内核的 add 走锚点）
        if (mode === 'add' && PM.normalizeName(nm) && have.has(PM.normalizeName(nm))) { mode = 'update'; sameName.push(nm); }
        const key = 'store:' + mode + ':' + PM.normalizeName(nm) + '#' + i;    // 稳定 key（逐条决策/逐处挑都用它）
        if (mode === 'update' && e.mode === 'patch') return { op: 'update', key, name: nm, wasName: nm, base: String(e.base ?? ''), next: String(e.next ?? ''), place: e.place || {} };
        if (mode === 'update') return { op: 'update', key, name: nm, wasName: nm, base: '', next: String((e.entry && e.entry.content) ?? e.next ?? ''), place: e.place || {}, entry: e.entry || null };
        if (mode === 'remove') return { op: 'remove', key, name: nm, base: String(e.base ?? ''), place: e.place || {} };
        /* ★★D2（2026-09-22 · **保真 BUG**）：改前这里**写死 `enabled: true`** ⇒ 上传方"关着"的条目
           到收方变成**开着**（无声改了他的设定）—— 上传侧 `stFields()` 现在会把真实开关装进包里。
           口径：**有就随、没有就按老行为 true**（老包一个字都没带过开关 ⇒ 行为与改前**逐字一样**）。
           取值顺序：包的**条目对象**上那份（`entry.enabled`）优先 —— 它是唯一能穿过服务端
           `sanitizeEntry()` 的位置（服务端重建 `one` 时会把顶层未知字段丢掉，见 `e2e/d2-status.md`
           的「需要后端配合」）；其次认包条目的顶层 `e.enabled`（本机导入的包两种都在）。
           ★内核侧不用改：`applyPatch` 的 add 分支本来就是 `order.splice(at+1, 0, { identifier, enabled: op.enabled !== false })`
             （`preset-merge.js` 里那两处），它一直认这个字段。 */
        const en = (e.entry && typeof e.entry.enabled === 'boolean') ? e.entry.enabled
            : (typeof e.enabled === 'boolean' ? e.enabled : true);
        return { op: 'add', key, name: nm, entry: (e.entry && typeof e.entry === 'object') ? e.entry : { name: nm, content: '' }, enabled: en, place: e.place || {} };
    };
    if (kind === 'ywp-patch') {
        const ops = (Array.isArray(pack.ops) ? pack.ops : []).map((op, i) => {
            if (!op || typeof op !== 'object' || op.op !== 'add' || !PM.normalizeName(String(op.name || '')) || !have.has(PM.normalizeName(String(op.name || '')))) return op;
            sameName.push(String(op.name || ''));                        // 同一个口径：新增撞名 → 改你那条
            return { op: 'update', key: String(op.key || ('store:update#' + i)), name: String(op.name || ''), wasName: String(op.name || ''), base: '', next: String((op.entry && op.entry.content) ?? op.next ?? ''), place: op.place || {}, entry: op.entry || null };
        });
        return { patch: { ...pack, ops }, sameName };
    }
    if (kind !== 'ywp-entry') throw new Error('这个包不是能缝进来的类型（kind=' + (kind || '没写') + '）');
    const list = Array.isArray(pack.entries) ? pack.entries : [];
    const ops = list.map(conv).filter(Boolean);
    // ★R8：`scope:"regex"` 的店包（与 single / multi / full 并列的新一类）→ 翻成 regexOps。
    //   一条正则 = 一个完整对象（13 字段一个不许少），所以这里**整条搬**、只挑 mode。
    //   包格式（写在 r8-kernel-status.md 里，两端一致）：{ kind:'ywp-entry', scope:'regex', entries:[],
    //     regexes:[{mode:'new'|'patch'|'remove'|'switch', reg, base, next, enabled, place}], regexOrder:[…] }
    const regexOps = (Array.isArray(pack.regexes) ? pack.regexes : []).map((r, i) => regexOpOf(r, i)).filter(Boolean);
    return {
        patch: {
            kind: 'ywp-patch', v: 1, from: '商店条目', to: String(pack.title || ''), ops,
            ...(regexOps.length ? { regexOps } : {}),
            ...(Array.isArray(pack.regexOrder) && pack.regexOrder.length ? { regexOrder: pack.regexOrder.map(String) } : {}),
            ...(pack.topFields && typeof pack.topFields === 'object' ? { topFields: pack.topFields } : {}),
            note: '',
        },
        sameName,
    };
}

/** 店包里的一条正则 → 内核的 regex-* op（纯函数；`scope:"regex"` 走它） */
function regexOpOf(r, i) {
    if (!r || typeof r !== 'object') return null;
    const mode = String(r.mode || (r.base ? 'patch' : 'new'));
    const key = String(r.key || ('store:regex-' + mode + '#' + i));
    const name = String((r.reg && r.reg.scriptName) || (r.next && r.next.scriptName) || (r.base && r.base.scriptName) || '');
    if (mode === 'remove') return { op: 'regex-remove', key, name, base: r.base || r.reg || null };
    if (mode === 'switch') return { op: 'regex-switch', key, name, base: r.base || r.reg || null, enabled: r.enabled !== false, place: r.place || {} };
    if (mode === 'patch') {
        const next = r.next || r.reg || null;
        if (!next) return null;
        return { op: 'regex-update', key, name: String(next.scriptName || name), wasName: String((r.base && r.base.scriptName) || name), base: r.base || null, next, rename: r.rename === true, place: r.place || {} };
    }
    const reg = r.reg || r.next || null;
    if (!reg) return null;
    return { op: 'regex-add', key, name, reg, place: r.place || {} };
}
/* ==== ywpu-store-core:end ==== */

/** 包 → 临时新版 B（纯内存；不落盘、不改入参）。返回 { next, report, how, anchors }（report/anchors 只有 op 路有）
 *  ★anchors = 每条 op 的 `place`（§4.1 的锚点那条）—— §22 页顶提示用它说"这条原来是挂在谁后面"。 */
function storePackToNext(pack, mine) {
    if (String((pack && pack.kind) || '') === 'ywp-preset') {
        if (!PM.isValidPreset(pack.preset)) throw new Error('这份整份预设读不出来（缺 prompts / prompt_order）');
        return { next: PM.clonePreset(pack.preset), report: null, how: '整份预设直接当新版', anchors: null };
    }
    const { patch, sameName } = storePackToPatch(pack, mine);
    const hasRegex = Array.isArray(patch.regexOps) && patch.regexOps.length;
    if (!Array.isArray(patch.ops) || (!patch.ops.length && !hasRegex)) throw new Error('这个包里没有能缝进来的条目');
    const r = PM.applyPatch({ preset: mine, patch, decisions: {} });     // 纯函数：跑一遍 = 把包全应用上
    if (sameName.length) r.report.storeSameName = sameName;              // 同名那几条给页顶提示用（不静默）
    const anchors = patch.ops.map(o => ({ name: String((o && o.name) || ''), place: (o && o.place) || {} }));
    // ★R8：正则的"三方基准"（作者旧版那份）——由包里的 base + 我的清单拼出来，
    //   这样对比页才分得清"作者改的"（默认跟作者）和"你改的"（默认保你的）。
    //   没有 regexOps 时留 null（= 两方对比，一律按"不覆盖你已有的"兜底）。
    if (hasRegex) r.regexBase = PM.regexBaseFromOps(PM.getRegexList(mine), patch.regexOps);
    return { next: r.preset, report: r.report, anchors, regexBase: r.regexBase || null, how: '内核 applyPatch 把包应用到你的预设上（' + patch.ops.length + (hasRegex ? ' 步 + ' + patch.regexOps.length + ' 条正则' : ' 步') + '）' };
}

/** 商店路的默认新预设名（跟商店老的默认名同一个口径：原名 +（商店 今天）） */
function storeDefaultName(mineName) {
    const base = String(mineName || '我的预设').replace(/\.json$/i, '').replace(/（商店 \d{4}-\d{2}-\d{2}）$/, '').replace(/（\d+）$/, '');
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return base + '（商店 ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '）';
}

/** ★P7 主入口（商店点「到更新器里挑」调它；Portal = `window.__ywUpdaterCloud.openStore`）
 *  做三件事：① A = 商店选定的那份预设 ② B = 内核把包应用出来的临时新版 ③ 打开**更新器完整对比页**（A → B）
 *  ★§22（A1）：来源块的字段约定 —— 入参带 `title` 与 `why`（商店那支会给），**给不给都要容错**：
 *    优先取入参顶层的，其次取卡片上的（`card.title` / `card.why` / `card.author` / `card.official`），
 *    最后退回包里自己的（`pack.title` / `pack.author`）与 `pack.src.presetName`（"来自哪份预设"）。
 *  ★M11（跨批契约 · R6-e 接收侧）：入参带 **`preview: true`** = **伪缝入**（商店上传预览里点「进详细缝入界面（伪）」走的就是它）：
 *    对比页**照常渲染**（用户要看到"缝进去会变成什么样"），但**所有会改盘的按钮失效并标「（预览）」**，
 *    四个写盘口（doGenerate / stitchIntoCurrent / applyPatchAndSave / exportPatch）在 preview 模式下**一律直接返回**。
 *    → `S.preview` 就是那个开关；商店那边也允许按老写法调 `openStorePseudo({…})`（本文件把它转成同一条路）。
 *  @param {{pack:object, card?:object, target?:string, title?:string, why?:string, author?:string, srcPreset?:string,
 *           preview?:boolean, keepBatch?:boolean}} opt */
function openStorePack(opt) {
    const o = (opt && typeof opt === 'object') ? opt : {};
    const pack = o.pack;
    const card = (o.card && typeof o.card === 'object') ? o.card : {};
    if (S.busy) { toast('warning', '正在生成/对比，等这次完成再点'); return false; }
    if (!pack || typeof pack !== 'object' || !pack.kind) {
        toast('error', '这张卡片的包读不出来（服务端没给全文？刷新一下商店再点）');
        console.warn('[预设更新器] 商店包不完整', pack);
        return false;
    }
    const title = String(o.title || card.title || pack.title || '商店条目');
    const why = String(o.why ?? card.why ?? pack.why ?? '');
    const author = String(o.author || card.author || pack.author || '');
    const srcPreset = String(o.srcPreset || (pack.src && pack.src.presetName) || card.baseName || '');
    const official = !!(o.official ?? card.official ?? (srcPreset && /余温/i.test(srcPreset)));
    const preview = !!o.preview;                            // ★M11：伪缝入（预览）—— 绝不写盘
    try {
        const mine = cloudPickMine(o.target);          // ① A（找不到就退到更新器已选 / 酒馆当前预设）
        if (!mine) { toast('warning', '酒馆里还没有预设。先到 设置 → 对话补全 里选一份，再回来点。'); return false; }
        const built = storePackToNext(pack, mine.preset);   // ② B（内存里拼，全程不落盘）
        const same = JSON.stringify(built.next) === JSON.stringify(mine.preset);
        const rep = built.report;
        if (same) {
            toast('info', '这个包跟 ' + mine.name + '没有任何不一样的地方，没有要缝的。'
                + (rep && rep.unresolved.length ? '（另外有 ' + rep.unresolved.length + ' 条没在你这份里找到）' : ''));
            return false;
        }
        // 这次会话 = "从商店来的"：头部写来源、生成时绝不覆盖同名、写盘后回商店记账
        S.base = null; S.baseName = ''; S.baseFrom = '';      // 商店路是两方对比（别残留上次的③）
        S.extraEntries = []; S.selIdents = []; S.orderVisibleIds = null; S.orderOverride = null; S.unpair = [];   // ★W9-5：新会话 = 选择与"看得见的那份"都重来
        S.preview = preview;                                  // ★M11：单张这条路也照实带上（默认 false）
        if (!o.keepBatch) S.storeBatch = null;                // 单张打开 = 退出上一次的批量（批量内部重开会带 keepBatch）
        S.store = {
            cardId: String(card.id || ''), title, why, author, official, srcPreset, kind: String(pack.kind),
            target: mine.name, at: Date.now(), report: rep, anchors: built.anchors || null, preview,
        };
        S.next = built.next;                            // ★B（临时新版）——不落盘，就是把包应用出来的那份
        S.regexBase = built.regexBase || null;          // ★R8：正则的三方基准（有才判得出"作者改的"/"你改的"）
        /* ★W107-②：原来这里写 `S.regexOpen = false`（新一次对比，正则块回到收起）—— 该键已退役；
           新一次对比的显示状态由 `defaultScopeOf()`（analyze 那条路）统一复位，这里不再写。 */
        S.nextName = '☁ 商店：《' + title + '》';       // 只给"③ 新版"这个位置显示，不参与写盘命名
        /* ★Wave H₂ ②（plan §D.2⒜ · 作者第二十批点名的真 BUG）：**"这次是从商店来的"要如实记进状态**，
           并把源区槽位**当场重画一次**。改前这两件事都没有 ⇒ 卡上 ①②③ 停在**上一轮手选那轮画的** DOM 上，
           而窗口内容已经是商店这份 ⇒ 作者原话"槽位显示的内容 ≠ 窗口里那次对比的内容"。
           ★只在这里调 `renderSource()`（**不许**塞进 `renderAll()`：那会让每次重画都重建三个 `<select>`，
             正在输入/焦点/滚动全受牵连，违反"任何重绘都不许让滚动/输入跳掉"那条铁律）。 */
        S.nextFrom = 'store';
        renderSource();
        S.newName = storeDefaultName(mine.name);
        /* ★Wave B2（plan §3.2③ ⒜ + §8.2 说的"商店路不许留无管线的洞"）：`storePackToNext()` 之后、
           **渲染之前**，把"基准"这条管线跑完 ——
             · 卡带 `baseVersion`（= declaredVer）且与你这份对得上 ⇒ 把那一版整份取回来落进 `S.base`
               （→ 三方对比 + 点亮「谁改的」）；
             · 对不上 / 库里没有那一版 / 取不回来 ⇒ **两方对比 + 明说**（绝不硬标归属，也绝不回退成"最接近的那一版"）。
           ★字段来源：商店那支给的 `o.baseVersion` 优先，其次卡上的（`cardOf` 里的 `baseVersion`，Wave D 在加），
             最后退回包里自己的（老包没有就 = 没声明 ⇒ 状态③）。 */
        S.lock = null;
        lockRun({ declaredVer: String(o.baseVersion || card.baseVersion || pack.baseVersion || ''), who: '这张卡', cloud: true });
        openWindow();
        runAnalyze();                                   // 复用更新器**现成**的对比（一栏正文+上下两组底色 / 三颗按钮 / 顺序页…）
        const n = rep ? (rep.summary.update + rep.summary.add + rep.summary.remove + rep.summary.switch) : built.next.prompts.length;
        const bad = rep ? (rep.unresolved.length) : 0;
        toast('success', '「' + title + '」已经拼成一份新版了（' + built.how + '）：共 ' + n + ' 处要你看'
            + (bad ? ' · 有 ' + bad + ' 条在你这份里没找到（跳过）' : '')
            + (preview ? ' —— ★这是**预览（伪缝入）**：随便看，按钮都不会写盘' : ' —— 在下面挑完点「生成新预设」= 另存新名，你手上这份一个字不动'));
        console.info('[预设更新器] 商店的包已拼成临时新版（不落盘）', {
            卡片: title, 包种类: pack.kind, 缝进: mine.name, 怎么拼的: built.how, 预览: preview || undefined,
            报告: rep ? { 改: rep.summary.update, 新增: rep.summary.add, 删除: rep.summary.remove, 开关: rep.summary.switch, 没找到: rep.unresolved.length, 位置不确定: rep.lowConf.length, 同名: rep.sameName.length } : '（整份预设直接当新版）',
        });
        return true;
    } catch (e) {
        toast('error', '这个包拼不进去：' + (e?.message || e));
        console.warn('[预设更新器] 商店的包没拼成', e, pack);
        return false;
    }
}

/** ★M11（跨批契约）：**伪缝入** —— 商店上传页点「进详细缝入界面（伪）」调它。
 *  商店侧也认 `openStore({…, preview:true})`；两个口子**必须同一条路**（不许各写一套，否则行为会飘）。 */
function openStorePseudo(opt) {
    const o = (opt && typeof opt === 'object') ? opt : {};
    return openStorePack({ ...o, preview: true });
}

/* ---------------- ★F2（跨批契约）：一键更新全部「有更新」的卡 → 只跳进来，让用户逐条挑 ----------------
 *  商店侧 call：`window.__ywUpdaterCloud.openStoreBatch({ target, items:[{card, pack, title, why}] })`
 *  （items 顺序 = 商店里"有更新"的卡，官方那几张排前面；每项与单张的 openStore 同形）
 *  口径（作者台账 F2 + 执行要求）：★**不真的自动更新** —— 更新器在这里只做两件事：
 *    ① 把**第 1 张**按单张那条路打开（同一套对比页、同一套按钮，一个字不另写）；
 *    ② 页顶给一条"一起挑：第 N/M 张"的进度条，带「上一张 / 下一张 / 退出批量」；
 *       用户点「生成新预设」写盘成功后**自动带出下一张**（不写盘就永远不跳，绝不替用户做决定）。
 *  状态：`S.storeBatch = { items, i, target, preview }`；`openStorePack(…, {keepBatch:true})` 负责切张。 */
function openStoreItemAt(i) {
    const b = S.storeBatch;
    if (!b || !b.items.length) return false;
    b.i = Math.max(0, Math.min(Number(i) || 0, b.items.length - 1));
    const it = b.items[b.i] || {};
    const ok = openStorePack({
        pack: it.pack, card: it.card, target: it.target || b.target,
        title: it.title, why: it.why, author: it.author, srcPreset: it.srcPreset,
        preview: !!b.preview, keepBatch: true,
    });
    renderHead();                       // 进度条（第 N/M 张）跟着走
    return ok;
}
/** 批量入口（商店 F2 调的） */
function openStoreBatch(opt) {
    const o = (opt && typeof opt === 'object') ? opt : {};
    const all = (Array.isArray(o.items) ? o.items : []).filter(x => x && typeof x === 'object');
    const items = all.filter(x => x.pack && x.pack.kind);
    /* ★R9-i：少了卡片**要说清是哪几张、为什么**（以前静默丢掉，只报"没拉到正文"——
       探针与用户都看不出"我明明传了 3 张，怎么只剩 1 张"）。 */
    const dropped = all.filter(x => !(x.pack && x.pack.kind));
    if (dropped.length) {
        const names = dropped.map(x => String((x.card && x.card.title) || x.title || '（没标题）'));
        console.warn('[预设更新器] 这一批里有 ' + dropped.length + ' 张卡的正文没拉到（items[].pack 空）→ 先不带它们：' + names.join('、'), dropped);
        if (items.length) toast('warning', '有 ' + dropped.length + ' 张卡的正文没拉到（' + names.slice(0, 2).join('、') + '…）—— 这一批先带能拉到的；那几张在卡片上单独点「缝入」就行');
    }
    if (!items.length) { toast('warning', '没有能一起挑的卡（标题那几张的正文没拉到）'); return false; }
    S.storeBatch = { items, i: 0, target: String(o.target || ''), preview: !!o.preview, at: Date.now() };
    const ok = openStoreItemAt(0);
    if (!ok) {
        // 第 1 张都打不开（比如那份预设没有、或包一模一样）→ 别把用户留在"什么都没有"的批量态里
        S.storeBatch = null; renderHead();
        toast('info', '这一批的第 1 张打不开（可能跟你的预设本来就一样）—— 那就在卡片上逐张点吧');
        return false;
    }
    toast('info', '一共 ' + items.length + ' 张：挑完这一张点「生成新预设」，会自动带出下一张（最后一张会自动收工）');
    console.info('[预设更新器] 批量挑：' + items.length + ' 张卡（只打开对比页，什么都没写）', { target: S.storeBatch.target, 预览: S.storeBatch.preview || undefined });
    return true;
}

// ---------------------------------------------------------------- 启动
// 说明：本文件不再自挂载，由余温工具箱的卡片调用 mountPresetUpdater(容器)

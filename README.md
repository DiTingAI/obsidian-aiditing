# AiDiTing — Obsidian plugin

> Turn audio and video files in your vault — or a Bilibili / Douyin / Xiaohongshu link — into timestamped, chaptered Markdown notes.
> Only creates new notes; never modifies existing ones.
> Desktop only. Requires an API key from <https://aiditing.cn/workspace> (free tier: 30 minutes / month).

Chinese documentation is further down: [中文说明](#中文说明).

## What it does

- Pick an audio or video file in your vault (file menu, or command palette), or run **Transcribe from link** and paste a video URL. The plugin writes **new notes** into your target folder (default `00-Inbox`).
- A multi-part Bilibili video becomes one note per part; you tick which parts you want. You can paste the whole share text copied from the mobile app — the plugin extracts the URL.
- The note contains frontmatter (source file or source URL, duration, task ID), a summary, chapter headings, the transcript with timestamps, and a plain-text body without timestamps.
- It **only creates new notes**. It never edits, moves, or deletes existing notes. Name collisions get a numeric suffix, for example `x.md` becomes `x-2.md`.
- Processing time depends on file length, network conditions, and the current queue. There is no fixed time promise — the interface only reports the current status.

## What it does not do

- **No links outside the three platforms.** Bilibili, Douyin and Xiaohongshu only. Anything else (YouTube, course platforms, podcast pages) has to be downloaded and uploaded as a local file.
- **No paywall bypass.** Only publicly accessible content is processed. Members-only, paid, or private videos will fail.
- **No in-place updates.** There is no "update the existing note" action.
- **No mobile support.** `isDesktopOnly: true`.
- **No path confirmation for links.** A single link may write a dozen notes, so the plugin does not ask per file; it writes into `00-Inbox` and never overwrites.

## Privacy

This plugin uploads the file you select (or the platform link you paste) to `api.diting.cc` for transcription.

- What leaves your machine: the file itself, its name, its duration — or just the URL for link transcription.
- Where it goes: `api.diting.cc`, our own server. No third-party storage.
- What it is used for: producing the transcript and the note for that one task.
- Not used for model training, not resold, not shared with third parties.
- **Without an API key nothing is uploaded at all** — the plugin only reads files locally.
- Your API key stays on your machine (plugin settings). It is sent only in the `Authorization` header to our own API — never in a URL, never logged, never shared with third parties. Our server stores only a hash and a short prefix of it.
- **No analytics.** The plugin sends no telemetry. Our server only sees that a task was submitted from the plugin (the `client` field on the task row) for quota accounting and troubleshooting; it never records which notes you open.
- It never reads the content of your other notes. To list transcribable files it enumerates vault paths (`vault.getFiles`) and filters by extension only.

## Install

1. Settings → Community plugins → Browse → search **AiDiTing** → Install, then Enable.
2. Open the plugin settings and click **Create key** to open the workspace, sign in, create an API key, and copy it.
3. Back in Obsidian, run the command **Paste API key from clipboard**.

Manual install: copy `main.js`, `manifest.json` and `styles.css` into `<Vault>/.obsidian/plugins/aiditing/`.

License: MIT (see [LICENSE](./LICENSE)). The `main.js` in this repository is a build artifact, **unminified and unobfuscated** so it can be read directly. Source lives in `src/`, tests in `tests/`, and the build is reproducible with `npm install && npm run build`.

---

## 中文说明

把 Vault 里的音视频文件，或一个 B站 / 抖音 / 小红书链接，整理成带时间戳与章节的 Markdown，落进你指定的目录。**只新增文件，不改动、不移动已有笔记。**

对应页面：<https://aiditing.cn/connect/obsidian>

### 第一次用：两步

1. 装好后 Obsidian 会弹一条提示，**点它**打开工作台（每月 30 分钟免费），登录后创建 API Key 并复制
2. 回 Obsidian 运行命令 **`粘贴 API Key（从剪贴板）`**，Key 自动填好，不用再去翻设置页

没有 Key 时插件不会上传任何文件。

### 现在能做什么

- 选中（或右键）一个 Vault 内的音频/视频文件 → 生成笔记，写入目标目录（默认 `00-Inbox`）
- **贴链接也能整理**：命令面板运行 `从链接整理（B站 / 抖音 / 小红书）`，可直接粘贴 App 里复制出来的整段分享文案；多P 合集可勾选要哪几集，一集一篇
- 本地上传在写入前显示最终路径，路径可改，确认后才落盘
- 重名自动加序号（`x.md` → `x-2.md`），绝不覆盖
- 笔记结构：YAML 前置元数据（来源、时长、任务号）→ 原媒体嵌入 → 摘要 → 按时间切的章节 → 逐句带时间戳的正文 → 去时间戳的纯文本
- 原媒体嵌入（可关）：把 Vault 里的原音视频嵌到笔记顶部；**点正文里的 `00:12` 直接跳到该秒并播放**（阅读模式下）

### 不做什么（写在这里，免得你试完失望）

- **链接只支持三家**：B站 / 抖音 / 小红书。别的站点（YouTube、网课平台、播客页等）请下载后走本地上传
- **不绕过登录与付费墙**：只处理公开可访问的内容，充电专属、会员专享、私密视频会失败
- **链接转写不弹路径确认**：可能一次写十几篇，逐篇弹窗会烦人；默认写入 `00-Inbox`，重名自动加序号，不会覆盖
- **不写移动端**：`isDesktopOnly: true`，手机端 Obsidian 装不上，也没验证过
- **不改已有笔记**：没有「更新原笔记」这个操作
- **不承诺耗时**：界面只报当前状态（排队中 / 进度百分比），不显示预计完成时间——真实耗时取决于文件时长、网络与队列
- **时间点跳转只在阅读模式生效**：Live Preview 下时间点是编辑器文本，不是 DOM 元素，挂不上点击事件——这是技术限制，不是没做。切到阅读模式才能点
- **没有嵌入原媒体就跳不了**：笔记里没有 `![[原音视频]]` 时，点时间点会明确提示「找不到原媒体播放器」，不会静默无反应

### 隐私与数据（上架审核会看这一节）

**这个插件会把你选中的文件（或粘贴的平台链接）上传到我们的服务器。** 用之前请先确认这一点可以接受：

| 问题 | 回答 |
|---|---|
| 什么数据会离开你的电脑 | 你主动选择的那一个音视频文件本身、它的文件名、时长；链接转写则只有那条链接 |
| 发到哪里 | `api.diting.cc`（爱谛听自己的服务器）。不经过任何第三方网盘 |
| 用来做什么 | 只用于生成这次的转写文本与笔记 |
| 会不会用来训练模型 | **不会** |
| 会不会转发给别人 | **不会**，不做二次分发 |
| 没配 Key 会不会上传 | **不会**。没有 Key 时插件一个字节都不发，只在本地读文件 |
| API Key 存在哪、怎么发 | 只存在你本机的插件配置里。请求时放进 `Authorization` 头发给我们自己的 API，**不写进 URL、不写进日志、不发第三方**；服务端只存哈希与前后缀，库里没有明文 |
| 会不会统计我的使用行为 | **不做任何行为埋点**。插件不向任何第三方发送统计。我们服务器只知道「有一个任务是通过插件提交的」（任务表的 `client` 字段），用于算额度与排查问题，不记录你打开了哪些笔记 |
| 会不会翻看我的其他笔记 | **不读内容**。为了在选文件时列出可转写的音视频，插件会枚举 vault 内的文件路径（Obsidian 的 `vault.getFiles`），但只按扩展名挑出音视频，不打开、不解析、不上传任何你没选中的文件 |
| 想删掉已经上传的数据 | 联系客服提出，我们处理 |

只想留在本机的操作（读文件、写 Markdown）全部在本地完成，不上传。

### 安装

#### 从社区插件市场（推荐）

设置 → 第三方插件 → 浏览 → 搜索 **AiDiTing** → 安装并启用。

目录里的名字是英文 `AiDiTing`，不是中文「爱谛听」（Obsidian 的 manifest 命名规范只接受 Basic Latin 字符），所以搜中文搜不到。目录清单每小时同步一次，刚上架时可能还搜不到，重启 Obsidian 或稍后再试。

#### 手动安装（备选）

```bash
# 1. 把三个文件放进 Vault 的插件目录
<Vault>/.obsidian/plugins/aiditing/
├─ main.js
├─ manifest.json
└─ styles.css
```

2. Obsidian → 设置 → 第三方插件 → 关闭「安全模式」
3. 在「已安装插件」里找到「AiDiTing」，启用
4. 打开插件设置 → 点「去创建」打开工作台，登录后创建 API Key，复制回来粘贴（免费额度每月 30 分钟）

### 配置项

| 设置 | 默认 | 说明 |
|---|---|---|
| API Key | 空 | 在[工作台](https://aiditing.cn/workspace)登录后创建；为空时不允许执行任务，也不会上传任何文件 |
| API 地址 | `https://api.diting.cc` | 除非另行通知，不要改 |
| 笔记落库目录 | `00-Inbox` | 不存在会自动创建 |
| 章节切分间隔 | 10 分钟 | 填 0 则整篇一节 |
| 写入前确认路径 | 开 | 仅本地上传生效；链接转写不弹窗 |
| 生成后打开笔记 | 开 | |

### 命令

- `整理当前音视频文件` —— 当前编辑区是音视频时可用
- `从 Vault 里选一个音视频整理` —— 弹选择框
- `从链接整理（B站 / 抖音 / 小红书）` —— 粘贴链接或整段分享文案
- 文件列表右键 → `爱谛听：整理成笔记`

### 构建

```bash
cd integrations/obsidian
npm install
npm run build     # tsc --noEmit + esbuild 产出 main.js
npm test          # 单测：时间戳解析 / 章节切分 / YAML 转义 / multipart 拼装 / 任务号解析
./scripts/package.sh   # 打成 dist/aiditing-0.1.0.zip（本地分发包，手动装用）
```

产物是根目录的 `main.js`，和 `manifest.json`、`styles.css` 一起构成插件包。

#### 发布到社区市场

产物要同步到独立仓库 <https://github.com/DiTingAI/obsidian-aiditing>（市场要求「插件仓库根目录即插件」），
由脚本完成构建、校验、推送、建 Release：

```bash
GITHUB_TOKEN=ghp_xxx ./scripts/release-obsidian.sh          # 发布
./scripts/release-obsidian.sh --dry-run                     # 只构建校验
```

脚本会拦下四种常见翻车：`manifest.version` 与 Release tag 不一致、`versions.json` 漏收录新版本、
`main.js` 把依赖误打进来（>3MB）、产物里混入 `localhost` 地址。另外它会先探测发布仓库是否 **Public**——
Private 仓库的 Release 资产客户端下载不到，用户装不上。

脚本除了产物，还会把 `src/`、`tests/`、`scripts/` 和构建配置一起同步过去——市场审核要能在仓库里读到源码，
只给 Release 附件是不够的。发布仓库因此有自己的一份 `.gitignore`（只挡 `node_modules/`、`dist/`），
不能沿用项目根目录那份，否则 `main.js` 会被忽略、进不了仓库。

上架提交入口是 <https://community.obsidian.md>（用 Obsidian 账号登录并关联 GitHub，再「Add your plugin」），
不需要再向 `obsidianmd/obsidian-releases` 提 PR，那个仓库的 PR 入口已经关闭。

#### 冒烟（不用打开 Obsidian）

接口契约最容易变的地方（上传返回多套一层、任务号藏在 `duplicate_files`、字段改名），
在 Obsidian 里手点很难定位。用真实 Key 跑一遍 Node 脚本，几秒钟出结果：

```bash
AIDITING_KEY=sk-diting-xxx npx tsx scripts/smoke.ts /path/to/lecture.mp3 --out /tmp
```

它会打印进度、把生成的 Markdown 写到 `/tmp`，并报出正文字数、章节数、时间戳行数。

### 实现要点（给后面接手的人）

- 走 `/v1` 开放 API（`Authorization: Bearer <key>`），不是网页端接口：网页端要 JWT，等于把真实账号凭证塞进插件
- 上传用 `requestUrl` + 手工拼 multipart：Obsidian 的 `requestUrl` 只接受 `string | ArrayBuffer`，没有 FormData
- 上传接口的返回比状态接口**多一层嵌套**（`data.data.task_ids`），解析时两层都要扫，否则拿不到任务号
- 内容去重命中时 `task_ids` 为 null，任务号藏在 `duplicate_files[].existing_task_id` 里——复用它，别让用户卡在「已上传过」的死路
- 时间戳解析不出来时**不编造章节**，退化成纯文本段落
- 每个请求都带 `X-Aiditing-Client: obsidian`：后端拿它给任务打「来源终端」标记，用来区分插件与网页端的用量（不影响任何功能，旧后端会忽略这个头）

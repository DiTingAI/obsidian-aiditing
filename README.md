# AiDiTing（爱谛听）Obsidian 插件

> Turn audio and video files in your vault into timestamped, chaptered Markdown notes.
> Only creates new notes; never modifies existing ones.
> Desktop only. Requires an API key from <https://aiditing.cn/workspace> (free tier: 30 minutes / month).

把 Vault 里的音视频文件整理成一篇带时间戳与章节的 Markdown，落进你指定的目录。**只新增文件，不改动、不移动已有笔记。**

对应页面：<https://aiditing.cn/connect/obsidian>

## English

AiDiTing turns audio and video files inside your vault into timestamped, chaptered Markdown notes.

- Pick an audio or video file in your vault (file menu, or command palette) and the plugin writes **one new note** into your target folder (default `00-Inbox`).
- The note contains frontmatter (source file, duration, task ID), a summary, chapter headings, the transcript with timestamps, and a plain-text body without timestamps.
- It **only creates new notes**. It never edits, moves, or deletes existing notes. Name collisions get a numeric suffix, for example `x.md` becomes `x-2.md`.
- Desktop only (`isDesktopOnly: true`). It requires an API key created at <https://aiditing.cn/workspace>; the free tier is 30 minutes per month.
- The file you select is uploaded to `api.diting.cc` for transcription. Without an API key nothing is uploaded at all. Uploaded data is not used for model training and is not shared with third parties. See the privacy section below.
- Not supported: online video links, mobile, and updating an existing note in place.

Processing time depends on file length, network conditions, and the current queue. There is no fixed time promise — the interface only reports the current status.

开源协议：MIT（见 [LICENSE](./LICENSE)）。本仓库根目录的 `main.js` 是构建产物，**构建时不压缩、不混淆**，可直接阅读；
完整源码在 `src/`、单测在 `tests/`，配合 `package.json`、`package-lock.json`、`esbuild.config.mjs`、`tsconfig.json` 可在本地复现构建（`npm install && npm run build`）。

## 现在能做什么

- 选中（或右键）一个 Vault 内的音频/视频文件 → 生成笔记，写入目标目录（默认 `00-Inbox`）
- 写入前显示最终路径，路径可改，确认后才落盘
- 重名自动加序号（`x.md` → `x-2.md`），绝不覆盖
- 笔记结构：YAML 前置元数据（来源、时长、任务号）→ 摘要 → 按时间切的章节 → 逐句带时间戳的正文 → 去时间戳的纯文本

## 不做什么（写在这里，免得你试完失望）

- **不做链接转写**：入口只有 Vault 里的本地文件，贴不了在线视频链接
- **不写移动端**：`isDesktopOnly: true`，手机端 Obsidian 装不上，也没验证过
- **不改已有笔记**：没有「更新原笔记」这个操作
- **不承诺耗时**：界面只报当前状态（排队中 / 进度百分比），不显示预计完成时间——真实耗时取决于文件时长、网络与队列

## 构建

```bash
cd integrations/obsidian
npm install
npm run build     # tsc --noEmit + esbuild 产出 main.js
npm test          # 单测：时间戳解析 / 章节切分 / YAML 转义 / multipart 拼装 / 任务号解析
./scripts/package.sh   # 打成 dist/aiditing-0.1.0.zip（内测分发包）
```

产物是根目录的 `main.js`，和 `manifest.json`、`styles.css` 一起构成插件包。

### 发布到社区市场

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

### 冒烟（不用打开 Obsidian）

接口契约最容易变的地方（上传返回多套一层、任务号藏在 `duplicate_files`、字段改名），
在 Obsidian 里手点很难定位。用真实 Key 跑一遍 Node 脚本，几秒钟出结果：

```bash
AIDITING_KEY=sk-diting-xxx npx tsx scripts/smoke.ts /path/to/lecture.mp3 --out /tmp
```

它会打印进度、把生成的 Markdown 写到 `/tmp`，并报出正文字数、章节数、时间戳行数。

## 隐私与数据（上架审核会看这一节）

**这个插件会把你选中的文件上传到我们的服务器。** 用之前请先确认这一点可以接受：

| 问题 | 回答 |
|---|---|
| 什么数据会离开你的电脑 | 你主动选择的那一个音视频文件本身、它的文件名、时长 |
| 发到哪里 | `api.diting.cc`（爱谛听自己的服务器）。不经过任何第三方网盘 |
| 用来做什么 | 只用于生成这次的转写文本与笔记 |
| 会不会用来训练模型 | **不会** |
| 会不会转发给别人 | **不会**，不做二次分发 |
| 没配 Key 会不会上传 | **不会**。没有 Key 时插件一个字节都不发，只在本地读文件 |
| 会不会翻看我的其他笔记 | **不读内容**。为了在选文件时列出可转写的音视频，插件会枚举 vault 内的文件路径（Obsidian 的 `vault.getFiles`），但只按扩展名挑出音视频，不打开、不解析、不上传任何你没选中的文件 |
| 想删掉已经上传的数据 | 联系客服提出，我们处理 |

只想留在本机的操作（读文件、写 Markdown）全部在本地完成，不上传。

## 安装

### 从社区插件市场（已上架后）

设置 → 第三方插件 → 浏览 → 搜索「爱谛听」→ 安装并启用。

### 手动安装

```bash
# 1. 把三个文件放进 Vault 的插件目录
<Vault>/.obsidian/plugins/aiditing/
├─ main.js
├─ manifest.json
└─ styles.css
```

2. Obsidian → 设置 → 第三方插件 → 关闭「安全模式」
3. 在「已安装插件」里找到「爱谛听」，启用
4. 打开插件设置 → 点「去创建」打开工作台，登录后创建 API Key，复制回来粘贴（免费额度每月 30 分钟）

## 配置项

| 设置 | 默认 | 说明 |
|---|---|---|
| API Key | 空 | 在[工作台](https://aiditing.cn/workspace)登录后创建；为空时不允许执行任务，也不会上传任何文件 |
| API 地址 | `https://api.diting.cc` | 除非另行通知，不要改 |
| 笔记落库目录 | `00-Inbox` | 不存在会自动创建 |
| 章节切分间隔 | 10 分钟 | 填 0 则整篇一节 |
| 写入前确认路径 | 开 | 关掉就直接写默认路径 |
| 生成后打开笔记 | 开 | |

## 命令

- `整理当前音视频文件` —— 当前编辑区是音视频时可用
- `从 Vault 里选一个音视频整理` —— 弹选择框
- 文件列表右键 → `爱谛听：整理成笔记`

## 实现要点（给后面接手的人）

- 走 `/v1` 开放 API（`Authorization: Bearer <key>`），不是网页端接口：网页端要 JWT，等于把真实账号凭证塞进插件
- 上传用 `requestUrl` + 手工拼 multipart：Obsidian 的 `requestUrl` 只接受 `string | ArrayBuffer`，没有 FormData
- 上传接口的返回比状态接口**多一层嵌套**（`data.data.task_ids`），解析时两层都要扫，否则拿不到任务号
- 内容去重命中时 `task_ids` 为 null，任务号藏在 `duplicate_files[].existing_task_id` 里——复用它，别让用户卡在「已上传过」的死路
- 时间戳解析不出来时**不编造章节**，退化成纯文本段落

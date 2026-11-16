import type { TaskView } from "./api";
import { timestampMarkdown, type RemoteVideo } from "./platform";

/**
 * 把接口返回的三个字段拼成一篇能直接进 Vault 的 Markdown。
 *
 * 三条规矩：
 * 1. 只渲染后端给的东西。没有摘要就不写摘要段，没有时间戳就不假装有章节——
 *    缺内容时留空比补一段编造的话更可信。
 * 2. 时间戳一个都不能丢。这是用户能核对 AI 有没有胡说八道的唯一抓手。
 * 3. 开头必须写这是初稿。插件在上游做了再多的活，产物仍然是「要人过一遍」的半成品。
 */

export interface NoteMeta {
  /** 原文件名，写进 frontmatter 做溯源 */
  sourceName: string;
  /** 用于标题（去扩展名） */
  title: string;
  taskId: string;
  apiBase: string;
  /** 章节切分间隔，0 表示不切 */
  sectionMinutes: number;
  /**
   * 是否在笔记顶部嵌入原媒体（Obsidian 原生播放器）。
   *
   * 为什么需要它：逐句时间点只是「位置标注」，Obsidian 并没有把 `00:12` 这种行内代码
   * 变成可点击的跳转链接（见 tests 里对语法的实测结论）。没有播放器在同一个页面里，
   * 用户核对一句话要来回切窗口、手动拖时间轴——「逐句可核对」就退化成了「逐句很啰嗦」。
   *
   * 默认由调用方（设置项）显式开启，纯函数层不自己决定。
   */
  embedSource?: boolean;
  /**
   * 远程视频（B站 / 抖音 / 小红书）。
   *
   * 一旦有值，说明原视频**不在 vault 里**：既不能 `![[...]]` 嵌入，也没有播放器可跳。
   * 此时时间点改成按平台能力渲染——B站能带 `?t=` 跳网页对应秒，
   * 抖音/小红书只能做位置标注（见 platform.ts）。
   */
  remote?: RemoteVideo;
  /** 原视频链接，写进 frontmatter 便于以后回到源视频 */
  sourceUrl?: string;
}

export interface TimedLine {
  /** 原样的时间戳文本，如 00:12 或 1:02:30 */
  ts: string;
  seconds: number;
  text: string;
}

// 后端真实格式（2026-11-15 直接查生产库 video_processing_tasks.transcript_with_timestamp 确认）：
//   00:00:00 - 正文                   —— **无方括号**，这是线上主流格式
//   [00:12] 正文                      —— 早期写法 / 手工整理的片段
//   [00:12.340 - 00:15.200] 正文      —— nls_format.go 的起止区间 + 毫秒
//   [00:12.340 --> 00:15.200] 正文    —— SRT 风格
// 只捕获**起始**时间：章节切分和跳转都按起始点算，结束时间对读者没有额外信息。
//
// 之前这里只有一条「必须带方括号」的正则，线上真实数据一条都匹配不上，
// 结果整篇静默退化成纯文本、时间点全丢——用户看到的就是「生成的笔记没有时间戳」。
//
// 拆成两条：不带括号的**必须**有区间分隔符（- / --> / ~），
// 否则任何以「12:30」开头的普通正文都会被误判成时间戳，段落会被切碎。
const BRACKETED_LINE =
  /^\[\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d{1,3})?\s*(?:-->|[-–~])?\s*(?:\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)?\s*\]\s*(.*)$/;
const BARE_LINE =
  /^(\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d{1,3})?\s*(?:-->|[-–~])\s*(?:\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)?\s*(.*)$/;

/** 解析 `[00:12] 正文……` 每一行；解析不出时间戳的行归到上一条后面 */
export function parseTimedLines(raw: string | undefined): TimedLine[] {
  if (!raw) return [];

  const lines: TimedLine[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = BRACKETED_LINE.exec(line) ?? BARE_LINE.exec(line);
    if (m) {
      lines.push({ ts: m[1], seconds: toSeconds(m[1]), text: m[2].trim() });
      continue;
    }

    // 没有时间戳的行（长句换行、口播断行）不单独成条，接到上一条末尾
    const last = lines[lines.length - 1];
    if (last) last.text = `${last.text} ${line}`.trim();
  }
  return lines;
}

export function toSeconds(ts: string): number {
  const parts = ts.split(":").map((n) => Number(n));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** 章节标题：取该段第一句，去掉标点、截断，做成人能扫读的短标题 */
function sectionTitle(first: TimedLine, index: number, minutes: number): string {
  const cleaned = first.text
    .replace(/[，。！？、；：""''（）《》\s]+/g, " ")
    .trim()
    .slice(0, 18);
  const range = minutes > 0 ? `第 ${index + 1} 段` : "全文";
  return cleaned ? `${range} · ${cleaned}` : range;
}

function groupByMinutes(lines: TimedLine[], minutes: number): TimedLine[][] {
  if (minutes <= 0 || lines.length === 0) return [lines];

  const groups: TimedLine[][] = [];
  let current: TimedLine[] = [];
  let bucket = Math.floor(lines[0].seconds / (minutes * 60));

  for (const line of lines) {
    const b = Math.floor(line.seconds / (minutes * 60));
    if (b !== bucket && current.length > 0) {
      groups.push(current);
      current = [];
      bucket = b;
    }
    current.push(line);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** frontmatter 的字符串值统一加双引号并转义，文件名里带引号也不会把 YAML 弄坏 */
function q(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

export function buildNote(task: TaskView, meta: NoteMeta): string {
  const timed = parseTimedLines(task.textWithTimestamp);
  const plain = (task.text ?? "").trim();
  const summary = (task.summary ?? "").trim();

  if (timed.length === 0 && !plain) {
    throw new Error("任务已完成，但返回里没有正文。请把任务号反馈给我们。");
  }

  const created = new Date().toISOString();
  const duration = formatDuration(task.durationSeconds ?? 0);

  const front: string[] = [
    "---",
    `title: ${q(meta.title)}`,
    `source: ${q(meta.sourceName)}`,
    ...(meta.sourceUrl ? [`source_url: ${q(meta.sourceUrl)}`] : []),
    `duration: ${q(duration)}`,
    `created: ${created}`,
    "tags:",
    "  - 待整理",
    `aiditing_task: ${q(meta.taskId)}`,
    `aiditing_api: ${q(meta.apiBase)}`,
    "---",
  ];

  // 开头说明必须说实话：本地媒体能跳原生播放器，B站只能跳网页，抖音/小红书跳不了。
  // 三句话对应三种真实能力，写错任何一种，用户点一下发现没反应就会觉得整个功能是假的。
  const jumpHint = !meta.remote
    ? "每条前面的时间点**点一下就会跳到那句话的原声**（阅读模式下，上方播放器会跟着跳）。"
    : meta.remote.platform === "bilibili" && meta.remote.bvid
      ? "每条前面的时间点**点一下会跳到 B站对应的位置**（在浏览器里打开）。"
      : "每条前面是这句话在原视频里的位置标注——这个平台不支持跳到具体秒数，对不上时请回到原视频手动定位。";

  const body: string[] = [
    "",
    "> [!warning] 这是 AI 整理的初稿",
    `> 转写和术语纠正都可能出错，正式引用前请核对原音。${jumpHint}`,
    "",
  ];

  // 原媒体嵌入：逐句时间点只有在同一页能看到时间轴时才有核对价值。
  // 文件名里带 | # [ ] 会破坏 wiki 链接语法，这种情况宁可不嵌，也不要生成一个坏链接。
  // 远程视频（B站/抖音/小红书）在 vault 里根本没有文件，嵌了就是一个空引用。
  if (!meta.remote && meta.embedSource && !/[[\]|#]/.test(meta.sourceName)) {
    body.push(`![[${meta.sourceName}]]`, "");
  }

  if (summary) {
    body.push("## 摘要", "", summary, "");
  }

  if (timed.length > 0) {
    body.push("## 正文", "");
    const groups = groupByMinutes(timed, meta.sectionMinutes);
    groups.forEach((group, i) => {
      body.push(`### [${group[0].ts}] ${sectionTitle(group[0], i, meta.sectionMinutes)}`, "");
      for (const line of group) {
        // 远程视频的时间点按平台能力渲染：B站写成带 ?t= 的链接（点了跳网页），
        // 抖音/小红书只能留行内代码做标注。本地媒体仍由 seek.ts 接管点击。
        const stamp = meta.remote
          ? timestampMarkdown(meta.remote, line.ts, line.seconds)
          : `\`${line.ts}\``;
        // 用列表项而不是裸行：Obsidian 的预览模式会把连续单行合并成一段，列表能保住逐句一行
        body.push(`- ${stamp} ${line.text}`);
      }
      body.push("");
    });
  } else {
    // 没有解析出时间戳时，必须明说。安静地给一段没有时间点的正文，
    // 用户会以为插件本来就不支持，我们看到的现象也会被误判成「功能没做」——
    // 2026-11-15 就因为这里的静默退化，把后端格式问题查成了插件问题。
    body.push(
      "> [!info] 这次的结果没有时间点",
      "> 转写结果是纯文本，后端没有返回每句话的时间。正文照常可用，但点时间点回原音这一项用不了。",
      "",
      "## 正文",
      "",
      plain,
      "",
    );
  }

  // 带时间戳的正文适合核对，纯文本适合复制粘贴。两个都给，别让用户自己洗格式。
  if (timed.length > 0 && plain) {
    body.push("## 纯文本（去掉时间戳，便于复制）", "", plain, "");
  }

  return `${front.join("\n")}\n${body.join("\n").trimEnd()}\n`;
}

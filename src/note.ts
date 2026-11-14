import type { TaskView } from "./api";

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
}

export interface TimedLine {
  /** 原样的时间戳文本，如 00:12 或 1:02:30 */
  ts: string;
  seconds: number;
  text: string;
}

const TIMESTAMP_LINE = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;

/** 解析 `[00:12] 正文……` 每一行；解析不出时间戳的行归到上一条后面 */
export function parseTimedLines(raw: string | undefined): TimedLine[] {
  if (!raw) return [];

  const lines: TimedLine[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = TIMESTAMP_LINE.exec(line);
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
    `duration: ${q(duration)}`,
    `created: ${created}`,
    "tags:",
    "  - 待整理",
    `aiditing_task: ${q(meta.taskId)}`,
    `aiditing_api: ${q(meta.apiBase)}`,
    "---",
  ];

  const body: string[] = [
    "",
    "> [!warning] 这是 AI 整理的初稿",
    "> 转写和术语纠正都可能出错，正式引用前请核对原音。每条都带时间点，点回去就能听到原话。",
    "",
  ];

  if (summary) {
    body.push("## 摘要", "", summary, "");
  }

  if (timed.length > 0) {
    body.push("## 正文", "");
    const groups = groupByMinutes(timed, meta.sectionMinutes);
    groups.forEach((group, i) => {
      body.push(`### [${group[0].ts}] ${sectionTitle(group[0], i, meta.sectionMinutes)}`, "");
      for (const line of group) {
        // 用列表项而不是裸行：Obsidian 的预览模式会把连续单行合并成一段，列表能保住逐句一行
        body.push(`- \`${line.ts}\` ${line.text}`);
      }
      body.push("");
    });
  } else {
    body.push("## 正文", "", plain, "");
  }

  // 带时间戳的正文适合核对，纯文本适合复制粘贴。两个都给，别让用户自己洗格式。
  if (timed.length > 0 && plain) {
    body.push("## 纯文本（去掉时间戳，便于复制）", "", plain, "");
  }

  return `${front.join("\n")}\n${body.join("\n").trimEnd()}\n`;
}

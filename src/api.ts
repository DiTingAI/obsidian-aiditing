import type { Transport } from "./transport";
import { delay } from "./timer";

/**
 * 谛听开放 API 客户端（只覆盖插件需要的两个端点）。
 *
 * 为什么走 /v1 开放 API 而不是网页端接口：
 * 网页端的 /api/v1 需要 JWT，等于把某个真实账号的凭证塞进插件里；
 * 开放 API 用 API Key + 租户额度，身份是「这个 Key」，出问题能追溯、能单独吊销。
 *
 * 传输层从外面注入（见 transport.ts）：同一个客户端既能跑在 Obsidian 的 requestUrl 上，
 * 也能跑在 Node 的 fetch 上——冒烟脚本和单测才可能覆盖到真实的接口行为。
 */

// 已知状态用于补全和类型收窄，服务端将来新增状态也要能兜住。
// 写成 `"queued" | ... | string` 会被目录静态检查判为「字面量被 string 覆盖」
// （连着报 4 条 warning），故用 `(string & {})` 保留字面量又不封死类型。
export type TaskStatus = "queued" | "processing" | "completed" | "failed" | (string & {});

export interface TaskView {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  durationSeconds?: number;
  fileName?: string;
  sourceType?: string;
  text?: string;
  textWithTimestamp?: string;
  summary?: string;
  errorMessage?: string;
  createdAt?: string;
  completedAt?: string;
}

/** 单文件上限，与网页端一致（超过后端也是 413，但先在前端拦掉能省一次无用上传） */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

const UPLOAD_TIMEOUT_NOTE = "上传中断。检查网络后重试，或先用网页入口确认 Key 是否可用。";

import type { Platform, PlatformMatch } from "./platform";

/** 平台链接解析出的「可提交的一集」 */
export interface PlatformPart {
  url: string;
  title: string;
  /** 秒数，用于展示与额度提示 */
  seconds: number;
  /**
   * 后端原始时长文本（B站要 "MM:SS" 字符串，提交时原样回传）。
   * 抖音/小红书的时长是整数秒，这里统一成 "MM:SS" 文本，提交时只取 seconds。
   */
  durationText: string;
  /** 分P序号，从 1 开始；非 B站恒为 1 */
  page: number;
  thumbnail?: string;
  bvid?: string;
  aid?: number;
  cid?: number;
}

export interface PlatformCheckResult {
  platform: Platform;
  title: string;
  parts: PlatformPart[];
}

/** 后端端点用的是 `xhs`，与 platform.ts 里的取值一致 */
function platformEndpoint(platform: Platform): string {
  return platform;
}

/**
 * 客户端标识：让服务端能分清「这个任务是插件交的还是网页交的」。
 *
 * 为什么必须是固定值而不是 `obsidian-0.2.0`：服务端的 client 列是白名单列
 * （models/video_task.go 的 Client* 常量），版本号拼进来会被整条丢弃，
 * 结果是插件的任务全被记成 api。版本号另有去处（manifest.json / 请求 UA），
 * 不该挤进这列。
 */
const CLIENT_HEADER = "X-Aiditing-Client";
const CLIENT_NAME = "obsidian";

/** "12:30" / "1:02:30" / "750" → 秒 */
function toSeconds(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  if (t.includes(":")) {
    const parts = t.split(":").map((n) => Number(n));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    return parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** 秒 → "MM:SS"（超过 1 小时给 "HH:MM:SS"） */
function secondsToText(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export class AiditingApi {
  constructor(
    private readonly base: string,
    private readonly key: string,
    private readonly send: Transport,
  ) {}

  /**
   * 上传一个本地文件，返回 taskId。
   *
   * requestUrl 不支持 FormData，只能手工拼 multipart——这不是取巧，
   * Obsidian 的 requestUrl 对 body 的类型要求就是 string | ArrayBuffer。
   */
  async upload(fileName: string, mime: string, data: ArrayBuffer): Promise<string> {
    const boundary = `----aiditing${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

    // 文件名里的引号和换行会把 multipart 头撕开，必须转义掉
    const safeName = fileName.replace(/["\r\n]/g, "_");
    const head = new TextEncoder().encode(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);

    const body = new Uint8Array(head.byteLength + data.byteLength + tail.byteLength);
    body.set(head, 0);
    body.set(new Uint8Array(data), head.byteLength);
    body.set(tail, head.byteLength + data.byteLength);

    let res;
    try {
      res = await this.send({
        url: `${this.base}/v1/transcriptions/upload`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          [CLIENT_HEADER]: CLIENT_NAME,
        },
        body: body.buffer,
      });
    } catch (err) {
      throw new Error(`${UPLOAD_TIMEOUT_NOTE}（${describe(err)}）`);
    }

    const payload = parseJson(res.text);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(pickMessage(payload) ?? `上传失败（HTTP ${res.status}）`);
    }

    const taskId = extractTaskId(payload);
    if (!taskId) throw new Error("上传成功但没拿到任务号，请把这条信息反馈给我们。");
    return taskId;
  }

  async getTask(taskId: string): Promise<TaskView> {
    const res = await this.send({
      url: `${this.base}/v1/transcriptions/${encodeURIComponent(taskId)}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.key}`,
        [CLIENT_HEADER]: CLIENT_NAME,
      },
    });

    const payload = parseJson(res.text);
    if (res.status === 404) throw new Error("任务不存在或已过期，请重新整理这一段。");
    if (res.status < 200 || res.status >= 300) {
      throw new Error(pickMessage(payload) ?? `查询失败（HTTP ${res.status}）`);
    }

    const data = (payload as { data?: TaskView } | null)?.data;
    if (!data) throw new Error("查询返回里没有任务数据。");
    return data;
  }

  /**
   * 轮询到任务结束。
   *
   * 刻意不给「预计还有 X 分钟」：真实耗时取决于文件时长、网络与队列，
   * 估出来的数字一定会被打脸（项目铁律：不承诺转写耗时）。只报当前状态。
   */
  async waitForTask(
    taskId: string,
    onTick: (task: TaskView) => void,
    options: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<TaskView> {
    const intervalMs = options.intervalMs ?? 3000;
    const timeoutMs = options.timeoutMs ?? 40 * 60 * 1000;
    const started = Date.now();

    for (;;) {
      const task = await this.getTask(taskId);
      if (task.status === "completed" || task.status === "failed" || task.status === "error") return task;

      onTick(task);

      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `等待超时。任务 ${taskId} 可能仍在队列里，可以稍后在网页端用同一个 Key 查询结果。`,
        );
      }
      await sleep(intervalMs);
    }
  }

  /** POST JSON，返回统一的 data 字段 */
  private async postJson(path: string, body: unknown): Promise<unknown> {
    const res = await this.send({
      url: `${this.base}${path}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        [CLIENT_HEADER]: CLIENT_NAME,
      },
      body: new TextEncoder().encode(JSON.stringify(body)).buffer as ArrayBuffer,
    });

    const payload = parseJson(res.text);
    if (res.status < 200 || res.status >= 300) {
      // 原样透出后端 message：额度不足（E2004）这类信息吞掉，用户只会看到「参数错误」
      throw new Error(pickMessage(payload) ?? `请求失败（HTTP ${res.status}）`);
    }
    return (payload as { data?: unknown } | null)?.data;
  }

  /**
   * 链接预检：拿到标题、时长、多P列表。
   *
   * 三种平台响应结构不同，这里统一成 `parts[]`，上层只处理这一种形状：
   * - B站：`parts[]`（多P），时长是字符串 "MM:SS"
   * - 抖音/小红书：单条，时长是整数秒
   */
  async checkPlatform(match: PlatformMatch): Promise<PlatformCheckResult> {
    const data = (await this.postJson(
      `/v1/transcriptions/${platformEndpoint(match.platform)}/check`,
      { video_url: match.url },
    )) as Record<string, unknown> | null;

    if (!data) throw new Error("检查链接时没有拿到数据，请稍后重试。");

    const title = typeof data.title === "string" ? data.title : "";

    if (match.platform === "bilibili") {
      const raw = Array.isArray(data.parts) ? data.parts : [];
      const parts: PlatformPart[] = raw.map((item, index) => {
        const o = (item ?? {}) as Record<string, unknown>;
        const durationText = String(o.duration ?? "");
        return {
          url: String(o.url ?? match.url),
          title: String(o.title ?? `第${index + 1}P`),
          seconds: toSeconds(durationText),
          durationText,
          page: index + 1,
          thumbnail: typeof o.thumbnail === "string" ? o.thumbnail : undefined,
          bvid: typeof o.bvid === "string" ? o.bvid : match.bvid,
          aid: typeof o.aid === "number" ? o.aid : undefined,
          cid: typeof o.cid === "number" ? o.cid : undefined,
        };
      });

      // 单P 但后端没给 parts 时用顶层信息兜底，不能让用户看到「0 集可选」
      if (parts.length === 0) {
        const durationText = String(data.duration ?? "");
        parts.push({
          url: match.url,
          title: title || "未命名视频",
          seconds: toSeconds(durationText),
          durationText,
          page: 1,
          thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : undefined,
          bvid: match.bvid,
        });
      }

      return { platform: "bilibili", title, parts };
    }

    const seconds = Number(data.duration ?? 0);
    const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
    return {
      platform: match.platform,
      title,
      parts: [
        {
          url: typeof data.video_url_resolved === "string" ? data.video_url_resolved : match.url,
          title: title || "未命名视频",
          seconds: safeSeconds,
          durationText: secondsToText(safeSeconds),
          page: 1,
          thumbnail: typeof data.cover === "string" ? data.cover : undefined,
        },
      ],
    };
  }

  /**
   * 提交转写，返回任务号数组。
   *
   * 响应形状不同：B站是 `data.task_ids[]`，抖音/小红书是单个 `data.task_id`。
   * 统一成数组，上层就能一次提交多P再逐个轮询。
   */
  async submitPlatform(match: PlatformMatch, parts: PlatformPart[]): Promise<string[]> {
    if (parts.length === 0) throw new Error("没有选中任何一集。");

    if (match.platform === "bilibili") {
      const videos = parts.map((p) => ({
        url: p.url,
        title: p.title,
        // B站要求字符串时长，缺了直接 400
        duration: p.durationText,
        thumbnail: p.thumbnail ?? "",
        ...(p.aid !== undefined ? { aid: p.aid } : {}),
        ...(p.cid !== undefined ? { cid: p.cid } : {}),
      }));

      const data = (await this.postJson(`/v1/transcriptions/bilibili`, { videos })) as
        | Record<string, unknown>
        | null;
      const ids = data?.task_ids;
      return Array.isArray(ids) ? ids.map((v) => String(v)) : [];
    }

    const part = parts[0];
    const data = (await this.postJson(`/v1/transcriptions/${platformEndpoint(match.platform)}`, {
      video_url: part.url,
      title: part.title,
      // 抖音/小红书要整数秒
      duration: Math.max(0, Math.floor(part.seconds)),
      ...(part.thumbnail ? { thumbnail: part.thumbnail } : {}),
    })) as Record<string, unknown> | null;

    const id = data?.task_id;
    return typeof id === "string" ? [id] : [];
  }
}

/** 状态接口返回的是标准结构，上传接口多套一层（实测 2026-11-13），两层都要扫 */
export function extractTaskId(payload: unknown): string | undefined {
  const data = (payload as { data?: unknown })?.data;
  if (!data) return undefined;
  if (typeof data === "string") return data;

  const outer = data as Record<string, unknown>;
  const layers = [outer, outer.data].filter(
    (v): v is Record<string, unknown> => Boolean(v) && typeof v === "object",
  );

  for (const layer of layers) {
    for (const key of ["taskId", "task_id", "id"]) {
      const v = layer[key];
      if (typeof v === "string" && v) return v;
    }

    for (const key of ["task_ids", "taskIds", "tasks", "list", "items"]) {
      const list = layer[key];
      if (!Array.isArray(list) || list.length === 0) continue;
      const first: unknown = list[0];
      if (typeof first === "string" && first) return first;
      if (first && typeof first === "object") {
        for (const k of ["taskId", "task_id", "id"]) {
          const v = (first as Record<string, unknown>)[k];
          if (typeof v === "string" && v) return v;
        }
      }
    }

    // 内容去重命中时 task_ids 为 null，已有任务号藏在 duplicate_files 里。
    // 对用户来说那就是他要的结果，直接复用——不让他卡在「文件已上传过」这条死路上。
    const duplicates = layer.duplicate_files;
    if (Array.isArray(duplicates) && duplicates.length > 0) {
      const first = duplicates[0] as Record<string, unknown>;
      const v = first.existing_task_id;
      if (typeof v === "string" && v) return v;
    }
  }
  return undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function pickMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  for (const key of ["message", "msg", "error", "detail"]) {
    const v = p[key];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 轮询间隔用的延时。
 *
 * 实现搬到 timer.ts：那边只用 window.setTimeout（弹窗安全），
 * 也不再为了兼容 Node 去碰全局对象（目录扫描会报）。
 * Node 侧（单测 / 冒烟）由 tests/node-window.ts 装 window 垫片。
 */
export function sleep(ms: number): Promise<void> {
  return delay(ms);
}

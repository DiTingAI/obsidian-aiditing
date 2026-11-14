import type { Transport } from "./transport";

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

export type TaskStatus = "queued" | "processing" | "completed" | "failed" | string;

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
      headers: { Authorization: `Bearer ${this.key}` },
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

// 用全局 setTimeout 而不是 window.setTimeout：同一份代码要在 Obsidian 和 Node（单测/冒烟）里都能跑
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

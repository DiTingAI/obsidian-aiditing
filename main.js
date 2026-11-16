/*
爱谛听 Obsidian 插件 —— 构建产物，请勿直接编辑。
协议：MIT（见仓库根 LICENSE）  说明：https://aiditing.cn/connect/obsidian
产物未压缩、未混淆，可直接阅读；源码与本产物同在仓库内，见 src/。
*/
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AiditingPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/timer.ts
function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(), ms);
  });
}

// src/api.ts
var MAX_FILE_BYTES = 200 * 1024 * 1024;
var UPLOAD_TIMEOUT_NOTE = "\u4E0A\u4F20\u4E2D\u65AD\u3002\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\uFF0C\u6216\u5148\u7528\u7F51\u9875\u5165\u53E3\u786E\u8BA4 Key \u662F\u5426\u53EF\u7528\u3002";
function platformEndpoint(platform) {
  return platform;
}
var CLIENT_HEADER = "X-Aiditing-Client";
var CLIENT_NAME = "obsidian";
function toSeconds(text) {
  const t = text.trim();
  if (!t) return 0;
  if (t.includes(":")) {
    const parts = t.split(":").map((n2) => Number(n2));
    if (parts.some((n2) => Number.isNaN(n2))) return 0;
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
function secondsToText(total) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
var AiditingApi = class {
  constructor(base, key, send) {
    this.base = base;
    this.key = key;
    this.send = send;
  }
  /**
   * 上传一个本地文件，返回 taskId。
   *
   * requestUrl 不支持 FormData，只能手工拼 multipart——这不是取巧，
   * Obsidian 的 requestUrl 对 body 的类型要求就是 string | ArrayBuffer。
   */
  async upload(fileName, mime, data) {
    var _a;
    const boundary = `----aiditing${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    const safeName = fileName.replace(/["\r\n]/g, "_");
    const head = new TextEncoder().encode(
      `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${safeName}"\r
Content-Type: ${mime}\r
\r
`
    );
    const tail = new TextEncoder().encode(`\r
--${boundary}--\r
`);
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
          [CLIENT_HEADER]: CLIENT_NAME
        },
        body: body.buffer
      });
    } catch (err) {
      throw new Error(`${UPLOAD_TIMEOUT_NOTE}\uFF08${describe(err)}\uFF09`);
    }
    const payload = parseJson(res.text);
    if (res.status < 200 || res.status >= 300) {
      throw new Error((_a = pickMessage(payload)) != null ? _a : `\u4E0A\u4F20\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`);
    }
    const taskId = extractTaskId(payload);
    if (!taskId) throw new Error("\u4E0A\u4F20\u6210\u529F\u4F46\u6CA1\u62FF\u5230\u4EFB\u52A1\u53F7\uFF0C\u8BF7\u628A\u8FD9\u6761\u4FE1\u606F\u53CD\u9988\u7ED9\u6211\u4EEC\u3002");
    return taskId;
  }
  async getTask(taskId) {
    var _a;
    const res = await this.send({
      url: `${this.base}/v1/transcriptions/${encodeURIComponent(taskId)}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.key}`,
        [CLIENT_HEADER]: CLIENT_NAME
      }
    });
    const payload = parseJson(res.text);
    if (res.status === 404) throw new Error("\u4EFB\u52A1\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u6574\u7406\u8FD9\u4E00\u6BB5\u3002");
    if (res.status < 200 || res.status >= 300) {
      throw new Error((_a = pickMessage(payload)) != null ? _a : `\u67E5\u8BE2\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`);
    }
    const data = payload == null ? void 0 : payload.data;
    if (!data) throw new Error("\u67E5\u8BE2\u8FD4\u56DE\u91CC\u6CA1\u6709\u4EFB\u52A1\u6570\u636E\u3002");
    return data;
  }
  /**
   * 轮询到任务结束。
   *
   * 刻意不给「预计还有 X 分钟」：真实耗时取决于文件时长、网络与队列，
   * 估出来的数字一定会被打脸（项目铁律：不承诺转写耗时）。只报当前状态。
   */
  async waitForTask(taskId, onTick, options = {}) {
    var _a, _b;
    const intervalMs = (_a = options.intervalMs) != null ? _a : 3e3;
    const timeoutMs = (_b = options.timeoutMs) != null ? _b : 40 * 60 * 1e3;
    const started = Date.now();
    for (; ; ) {
      const task = await this.getTask(taskId);
      if (task.status === "completed" || task.status === "failed" || task.status === "error") return task;
      onTick(task);
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `\u7B49\u5F85\u8D85\u65F6\u3002\u4EFB\u52A1 ${taskId} \u53EF\u80FD\u4ECD\u5728\u961F\u5217\u91CC\uFF0C\u53EF\u4EE5\u7A0D\u540E\u5728\u7F51\u9875\u7AEF\u7528\u540C\u4E00\u4E2A Key \u67E5\u8BE2\u7ED3\u679C\u3002`
        );
      }
      await sleep(intervalMs);
    }
  }
  /** POST JSON，返回统一的 data 字段 */
  async postJson(path, body) {
    var _a;
    const res = await this.send({
      url: `${this.base}${path}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        [CLIENT_HEADER]: CLIENT_NAME
      },
      // 别在这里加 `as ArrayBuffer`：Uint8Array.buffer 的类型已经是 ArrayBufferLike，
      // 目录扫描会把它判成「多余断言」（0.1.12 的唯一一条代码类 medium）
      body: new TextEncoder().encode(JSON.stringify(body)).buffer
    });
    const payload = parseJson(res.text);
    if (res.status < 200 || res.status >= 300) {
      throw new Error((_a = pickMessage(payload)) != null ? _a : `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`);
    }
    return payload == null ? void 0 : payload.data;
  }
  /**
   * 链接预检：拿到标题、时长、多P列表。
   *
   * 三种平台响应结构不同，这里统一成 `parts[]`，上层只处理这一种形状：
   * - B站：`parts[]`（多P），时长是字符串 "MM:SS"
   * - 抖音/小红书：单条，时长是整数秒
   */
  async checkPlatform(match) {
    var _a, _b;
    const data = await this.postJson(
      `/v1/transcriptions/${platformEndpoint(match.platform)}/check`,
      { video_url: match.url }
    );
    if (!data) throw new Error("\u68C0\u67E5\u94FE\u63A5\u65F6\u6CA1\u6709\u62FF\u5230\u6570\u636E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    const title = typeof data.title === "string" ? data.title : "";
    if (match.platform === "bilibili") {
      const raw = Array.isArray(data.parts) ? data.parts : [];
      const parts = raw.map((item, index) => {
        var _a2, _b2, _c;
        const o = item != null ? item : {};
        const durationText = String((_a2 = o.duration) != null ? _a2 : "");
        return {
          url: String((_b2 = o.url) != null ? _b2 : match.url),
          title: String((_c = o.title) != null ? _c : `\u7B2C${index + 1}P`),
          seconds: toSeconds(durationText),
          durationText,
          page: index + 1,
          thumbnail: typeof o.thumbnail === "string" ? o.thumbnail : void 0,
          bvid: typeof o.bvid === "string" ? o.bvid : match.bvid,
          aid: typeof o.aid === "number" ? o.aid : void 0,
          cid: typeof o.cid === "number" ? o.cid : void 0
        };
      });
      if (parts.length === 0) {
        const durationText = String((_a = data.duration) != null ? _a : "");
        parts.push({
          url: match.url,
          title: title || "\u672A\u547D\u540D\u89C6\u9891",
          seconds: toSeconds(durationText),
          durationText,
          page: 1,
          thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : void 0,
          bvid: match.bvid
        });
      }
      return { platform: "bilibili", title, parts };
    }
    const seconds = Number((_b = data.duration) != null ? _b : 0);
    const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
    return {
      platform: match.platform,
      title,
      parts: [
        {
          url: typeof data.video_url_resolved === "string" ? data.video_url_resolved : match.url,
          title: title || "\u672A\u547D\u540D\u89C6\u9891",
          seconds: safeSeconds,
          durationText: secondsToText(safeSeconds),
          page: 1,
          thumbnail: typeof data.cover === "string" ? data.cover : void 0
        }
      ]
    };
  }
  /**
   * 提交转写，返回任务号数组与同序的文件名。
   *
   * 响应形状不同：B站是 `data.task_ids[]` + `data.file_names[]`，抖音/小红书是单个 `data.task_id`。
   * 统一成数组，上层就能一次提交多P再逐个轮询。
   *
   * **为什么要把 file_names 一起返回**：服务端是多 goroutine 并发建任务的（services/video_service.go），
   * `task_ids` 的 append 顺序取决于谁先跑完，不等于提交顺序；失败的那几集也不会出现在 `task_ids` 里。
   * 上层若按索引 `parts[i]` 配对，就会把第 3 集的正文写成第 1 集的标题和链接，时间点还跳到错误的 P。
   * `file_names` 与 `task_ids` 在同一个锁内成对 append，是唯一可靠的对应关系。
   */
  async submitPlatform(match, parts) {
    if (parts.length === 0) throw new Error("\u6CA1\u6709\u9009\u4E2D\u4EFB\u4F55\u4E00\u96C6\u3002");
    if (match.platform === "bilibili") {
      const videos = parts.map((p) => {
        var _a;
        return {
          url: p.url,
          title: p.title,
          // B站要求字符串时长，缺了直接 400
          duration: p.durationText,
          thumbnail: (_a = p.thumbnail) != null ? _a : "",
          ...p.aid !== void 0 ? { aid: p.aid } : {},
          ...p.cid !== void 0 ? { cid: p.cid } : {}
        };
      });
      const data2 = await this.postJson(`/v1/transcriptions/bilibili`, { videos });
      return {
        taskIds: toStringList(data2 == null ? void 0 : data2.task_ids),
        fileNames: toStringList(data2 == null ? void 0 : data2.file_names)
      };
    }
    const part = parts[0];
    const data = await this.postJson(`/v1/transcriptions/${platformEndpoint(match.platform)}`, {
      video_url: part.url,
      title: part.title,
      // 抖音/小红书要整数秒
      duration: Math.max(0, Math.floor(part.seconds)),
      ...part.thumbnail ? { thumbnail: part.thumbnail } : {}
    });
    const id = data == null ? void 0 : data.task_id;
    return {
      taskIds: typeof id === "string" ? [id] : [],
      fileNames: typeof (data == null ? void 0 : data.file_name) === "string" ? [data.file_name] : []
    };
  }
};
function toStringList(value) {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}
var MEDIA_EXT_RE = /\.(mp4|m4a|mp3|webm|flv|mkv|wav|aac|mov|avi|m4v)$/i;
function matchPart(parts, fileName, index) {
  if (fileName) {
    const stem = fileName.replace(MEDIA_EXT_RE, "");
    const hit = parts.find((p) => p.title === stem || p.title === fileName);
    if (hit) return hit;
  }
  return parts[index];
}
function extractTaskId(payload) {
  const data = payload == null ? void 0 : payload.data;
  if (!data) return void 0;
  if (typeof data === "string") return data;
  const outer = data;
  const layers = [outer, outer.data].filter(
    (v) => Boolean(v) && typeof v === "object"
  );
  for (const layer of layers) {
    for (const key of ["taskId", "task_id", "id"]) {
      const v = layer[key];
      if (typeof v === "string" && v) return v;
    }
    for (const key of ["task_ids", "taskIds", "tasks", "list", "items"]) {
      const list = layer[key];
      if (!Array.isArray(list) || list.length === 0) continue;
      const first = list[0];
      if (typeof first === "string" && first) return first;
      if (first && typeof first === "object") {
        for (const k of ["taskId", "task_id", "id"]) {
          const v = first[k];
          if (typeof v === "string" && v) return v;
        }
      }
    }
    const duplicates = layer.duplicate_files;
    if (Array.isArray(duplicates) && duplicates.length > 0) {
      const first = duplicates[0];
      const v = first.existing_task_id;
      if (typeof v === "string" && v) return v;
    }
  }
  return void 0;
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}
function pickMessage(payload) {
  if (!payload || typeof payload !== "object") return void 0;
  const p = payload;
  for (const key of ["message", "msg", "error", "detail"]) {
    const v = p[key];
    if (typeof v === "string" && v) return redactSecrets(v);
  }
  return void 0;
}
function describe(err) {
  return redactSecrets(err instanceof Error ? err.message : String(err));
}
var SECRET_RE = /sk-[A-Za-z0-9_-]{8,}/g;
function redactSecrets(text) {
  return text.replace(SECRET_RE, "sk-***");
}
function sleep(ms) {
  return delay(ms);
}

// src/media.ts
var MEDIA_MIME = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  opus: "audio/opus",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv"
};
function extOf(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}
function isMediaName(name) {
  return extOf(name) in MEDIA_MIME;
}
function mimeOf(name) {
  var _a;
  return (_a = MEDIA_MIME[extOf(name)]) != null ? _a : "application/octet-stream";
}
function baseName(name) {
  return name.replace(/\.[^.]+$/, "");
}
function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "\u672A\u547D\u540D";
}

// src/platform.ts
var BVID_RE = /BV[0-9A-Za-z]{10}/;
var URL_RE = /https?:\/\/[^\s，,、。；;"'）)]+/;
var HOSTS = [
  { platform: "bilibili", hosts: ["bilibili.com", "b23.tv"] },
  { platform: "douyin", hosts: ["douyin.com", "iesdouyin.com"] },
  { platform: "xhs", hosts: ["xiaohongshu.com", "xhslink.com"] }
];
function hostPlatform(hostname) {
  const host = hostname.toLowerCase();
  for (const entry of HOSTS) {
    if (entry.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return entry.platform;
  }
  return null;
}
function detectPlatform(input) {
  var _a, _b;
  const raw = (input != null ? input : "").trim();
  if (!raw) return null;
  const bareBv = raw.match(new RegExp(`^${BVID_RE.source}$`));
  if (bareBv) {
    return {
      platform: "bilibili",
      url: `https://www.bilibili.com/video/${bareBv[0]}`,
      bvid: bareBv[0]
    };
  }
  const urlText = (_a = raw.match(URL_RE)) == null ? void 0 : _a[0];
  if (!urlText) return null;
  let parsed;
  try {
    parsed = new URL(urlText);
  } catch (e) {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const platform = hostPlatform(parsed.hostname);
  if (!platform) return null;
  const bvid = platform === "bilibili" ? (_b = urlText.match(BVID_RE)) == null ? void 0 : _b[0] : void 0;
  return { platform, url: urlText, bvid };
}
function timestampMarkdown(video, ts, seconds) {
  if (video.platform === "bilibili" && video.bvid) {
    const at = Math.max(0, Math.floor(seconds));
    const query = video.page && video.page > 0 ? `?p=${video.page}&t=${at}` : `?t=${at}`;
    return `[${ts}](https://www.bilibili.com/video/${video.bvid}${query})`;
  }
  return `\`${ts}\``;
}
function platformLabel(platform) {
  switch (platform) {
    case "bilibili":
      return "B\u7AD9";
    case "douyin":
      return "\u6296\u97F3";
    case "xhs":
      return "\u5C0F\u7EA2\u4E66";
  }
}

// src/note.ts
var BRACKETED_LINE = /^\[\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d{1,3})?\s*(?:-->|[-–~])?\s*(?:\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)?\s*\]\s*(.*)$/;
var BARE_LINE = /^(\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d{1,3})?\s*(?:-->|[-–~])\s*(?:\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)?\s*(.*)$/;
function parseTimedLines(raw) {
  var _a;
  if (!raw) return [];
  const lines = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = (_a = BRACKETED_LINE.exec(line)) != null ? _a : BARE_LINE.exec(line);
    if (m) {
      lines.push({ ts: m[1], seconds: toSeconds2(m[1]), text: m[2].trim() });
      continue;
    }
    const last = lines[lines.length - 1];
    if (last) last.text = `${last.text} ${line}`.trim();
  }
  return lines;
}
function toSeconds2(ts) {
  const parts = ts.split(":").map((n) => Number(n));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function sectionTitle(first, index, minutes) {
  const cleaned = first.text.replace(/[，。！？、；：""''（）《》\s]+/g, " ").trim().slice(0, 18);
  const range = minutes > 0 ? `\u7B2C ${index + 1} \u6BB5` : "\u5168\u6587";
  return cleaned ? `${range} \xB7 ${cleaned}` : range;
}
function groupByMinutes(lines, minutes) {
  if (minutes <= 0 || lines.length === 0) return [lines];
  const groups = [];
  let current = [];
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
function q(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}
function buildNote(task, meta) {
  var _a, _b, _c;
  const timed = parseTimedLines(task.textWithTimestamp);
  const plain = ((_a = task.text) != null ? _a : "").trim();
  const summary = ((_b = task.summary) != null ? _b : "").trim();
  if (timed.length === 0 && !plain) {
    throw new Error("\u4EFB\u52A1\u5DF2\u5B8C\u6210\uFF0C\u4F46\u8FD4\u56DE\u91CC\u6CA1\u6709\u6B63\u6587\u3002\u8BF7\u628A\u4EFB\u52A1\u53F7\u53CD\u9988\u7ED9\u6211\u4EEC\u3002");
  }
  const created = (/* @__PURE__ */ new Date()).toISOString();
  const duration = formatDuration((_c = task.durationSeconds) != null ? _c : 0);
  const front = [
    "---",
    `title: ${q(meta.title)}`,
    `source: ${q(meta.sourceName)}`,
    ...meta.sourceUrl ? [`source_url: ${q(meta.sourceUrl)}`] : [],
    `duration: ${q(duration)}`,
    `created: ${created}`,
    "tags:",
    "  - \u5F85\u6574\u7406",
    `aiditing_task: ${q(meta.taskId)}`,
    `aiditing_api: ${q(meta.apiBase)}`,
    "---"
  ];
  const jumpHint = !meta.remote ? "\u6BCF\u6761\u524D\u9762\u7684\u65F6\u95F4\u70B9**\u70B9\u4E00\u4E0B\u5C31\u4F1A\u8DF3\u5230\u90A3\u53E5\u8BDD\u7684\u539F\u58F0**\uFF08\u9605\u8BFB\u6A21\u5F0F\u4E0B\uFF0C\u4E0A\u65B9\u64AD\u653E\u5668\u4F1A\u8DDF\u7740\u8DF3\uFF09\u3002" : meta.remote.platform === "bilibili" && meta.remote.bvid ? "\u6BCF\u6761\u524D\u9762\u7684\u65F6\u95F4\u70B9**\u70B9\u4E00\u4E0B\u4F1A\u8DF3\u5230 B\u7AD9\u5BF9\u5E94\u7684\u4F4D\u7F6E**\uFF08\u5728\u6D4F\u89C8\u5668\u91CC\u6253\u5F00\uFF09\u3002" : "\u6BCF\u6761\u524D\u9762\u662F\u8FD9\u53E5\u8BDD\u5728\u539F\u89C6\u9891\u91CC\u7684\u4F4D\u7F6E\u6807\u6CE8\u2014\u2014\u8FD9\u4E2A\u5E73\u53F0\u4E0D\u652F\u6301\u8DF3\u5230\u5177\u4F53\u79D2\u6570\uFF0C\u5BF9\u4E0D\u4E0A\u65F6\u8BF7\u56DE\u5230\u539F\u89C6\u9891\u624B\u52A8\u5B9A\u4F4D\u3002";
  const body = [
    "",
    "> [!warning] \u8FD9\u662F AI \u6574\u7406\u7684\u521D\u7A3F",
    `> \u8F6C\u5199\u548C\u672F\u8BED\u7EA0\u6B63\u90FD\u53EF\u80FD\u51FA\u9519\uFF0C\u6B63\u5F0F\u5F15\u7528\u524D\u8BF7\u6838\u5BF9\u539F\u97F3\u3002${jumpHint}`,
    ""
  ];
  if (!meta.remote && meta.embedSource && !/[[\]|#]/.test(meta.sourceName)) {
    body.push(`![[${meta.sourceName}]]`, "");
  }
  if (summary) {
    body.push("## \u6458\u8981", "", summary, "");
  }
  if (timed.length > 0) {
    body.push("## \u6B63\u6587", "");
    const groups = groupByMinutes(timed, meta.sectionMinutes);
    groups.forEach((group, i) => {
      body.push(`### [${group[0].ts}] ${sectionTitle(group[0], i, meta.sectionMinutes)}`, "");
      for (const line of group) {
        const stamp = meta.remote ? timestampMarkdown(meta.remote, line.ts, line.seconds) : `\`${line.ts}\``;
        body.push(`- ${stamp} ${line.text}`);
      }
      body.push("");
    });
  } else {
    body.push(
      "> [!info] \u8FD9\u6B21\u7684\u7ED3\u679C\u6CA1\u6709\u65F6\u95F4\u70B9",
      "> \u8F6C\u5199\u7ED3\u679C\u662F\u7EAF\u6587\u672C\uFF0C\u540E\u7AEF\u6CA1\u6709\u8FD4\u56DE\u6BCF\u53E5\u8BDD\u7684\u65F6\u95F4\u3002\u6B63\u6587\u7167\u5E38\u53EF\u7528\uFF0C\u4F46\u70B9\u65F6\u95F4\u70B9\u56DE\u539F\u97F3\u8FD9\u4E00\u9879\u7528\u4E0D\u4E86\u3002",
      "",
      "## \u6B63\u6587",
      "",
      plain,
      ""
    );
  }
  if (timed.length > 0 && plain) {
    body.push("## \u7EAF\u6587\u672C\uFF08\u53BB\u6389\u65F6\u95F4\u6233\uFF0C\u4FBF\u4E8E\u590D\u5236\uFF09", "", plain, "");
  }
  return `${front.join("\n")}
${body.join("\n").trimEnd()}
`;
}

// src/obsidian-transport.ts
var import_obsidian = require("obsidian");
var obsidianTransport = async (req) => {
  const res = await (0, import_obsidian.requestUrl)({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    throw: false
  });
  return { status: res.status, text: res.text };
};

// src/seek.ts
var TS_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
var notifyUser = () => {
};
function setSeekNotifier(fn) {
  notifyUser = fn;
}
function findPlayers(scope) {
  return Array.from(scope.querySelectorAll("video, audio"));
}
function pickPlayer(root, anchor) {
  var _a, _b;
  const scope = (_a = root.closest(".workspace-leaf")) != null ? _a : root;
  const candidates = Array.from(/* @__PURE__ */ new Set([...findPlayers(root), ...findPlayers(scope)]));
  if (candidates.length <= 1) return (_b = candidates[0]) != null ? _b : null;
  const anchorRect = anchor ? anchor.getBoundingClientRect() : null;
  let best = null;
  let bestScore = -Infinity;
  for (const m of candidates) {
    const r = m.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    let score = 0;
    if (visible) score += 100;
    if (!m.paused) score += 50;
    if (m.currentTime > 0) score += 20;
    if (visible && anchorRect) {
      const dy = Math.abs(r.top + r.height / 2 - (anchorRect.top + anchorRect.height / 2));
      score -= Math.min(dy / 100, 40);
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
function seekTo(player, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return false;
  let resumed = false;
  const startPlayback = () => {
    if (resumed) return;
    resumed = true;
    try {
      void player.play();
    } catch (e) {
    }
  };
  const apply = () => {
    try {
      player.pause();
      player.currentTime = seconds;
    } catch (e) {
      return;
    }
    const onSeeked = () => {
      player.removeEventListener("seeked", onSeeked);
      window.requestAnimationFrame(startPlayback);
    };
    player.addEventListener("seeked", onSeeked);
    window.setTimeout(() => {
      player.removeEventListener("seeked", onSeeked);
      startPlayback();
    }, 400);
  };
  if (player.readyState === 0) {
    const onReady = () => {
      player.removeEventListener("loadedmetadata", onReady);
      apply();
    };
    player.addEventListener("loadedmetadata", onReady);
    window.setTimeout(onReady, 1500);
    return true;
  }
  apply();
  return true;
}
function parseTimestamp(text) {
  const m = TS_RE.exec(text.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] === void 0 ? null : Number(m[3]);
  return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
}
function attachSeekHandlers(root) {
  var _a, _b;
  const codes = Array.from(root.querySelectorAll("code"));
  if (codes.length === 0) return 0;
  const playerNow = (anchor) => pickPlayer(root, anchor);
  let wired = 0;
  for (const el of codes) {
    if (el.dataset.aiditingSeek === "1") continue;
    const seconds = parseTimestamp((_a = el.textContent) != null ? _a : "");
    if (seconds === null) continue;
    el.dataset.aiditingSeek = "1";
    const label = ((_b = el.textContent) != null ? _b : "").trim();
    const markClickable = (hasPlayer) => {
      if (!hasPlayer) return;
      el.classList.add("aiditing-ts");
      el.setAttribute("role", "button");
      el.setAttribute("title", `\u70B9\u51FB\u8DF3\u5230 ${label}`);
    };
    markClickable(Boolean(playerNow(el)));
    if (!playerNow(el)) {
      window.setTimeout(() => markClickable(Boolean(playerNow(el))), 500);
    }
    el.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const player = playerNow(el);
      if (!player) {
        notifyUser(`\u8FD9\u7BC7\u7B14\u8BB0\u91CC\u6CA1\u6709\u627E\u5230\u539F\u5A92\u4F53\u64AD\u653E\u5668\uFF0C\u65F6\u95F4\u70B9 ${label} \u65E0\u6CD5\u8DF3\u8F6C\u3002`, 8e3);
        return;
      }
      player.scrollIntoView({ block: "nearest" });
      seekTo(player, seconds);
    });
    wired += 1;
  }
  return wired;
}
function inspectScope(root) {
  var _a;
  const codes = Array.from(root.querySelectorAll("code"));
  const ts = codes.map((c) => {
    var _a2;
    return parseTimestamp((_a2 = c.textContent) != null ? _a2 : "");
  }).filter((n) => n !== null);
  const scope = root.instanceOf(Element) ? (_a = root.closest(".workspace-leaf")) != null ? _a : root : root;
  const mediaCount = findPlayers(scope).length;
  return {
    timestamps: ts.length,
    player: mediaCount > 0,
    mediaCount,
    wired: codes.filter((c) => c.dataset.aiditingSeek === "1").length
  };
}

// src/settings.ts
var import_obsidian2 = require("obsidian");

// src/settings-values.ts
function normalizeSettingValue(key, value) {
  switch (key) {
    case "apiBase":
      return String(value != null ? value : "").trim().replace(/\/+$/, "");
    case "apiKey":
      return String(value != null ? value : "").trim();
    case "targetFolder":
      return String(value != null ? value : "").trim().replace(/^\/+|\/+$/g, "");
    case "sectionMinutes": {
      const raw = String(value != null ? value : "").trim();
      if (!raw) return 10;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
    }
    default:
      return value === true || value === "true";
  }
}
function validateSetting(key, value) {
  if (key === "apiBase") {
    const text = String(value != null ? value : "").trim();
    if (!text) return "API \u5730\u5740\u4E0D\u80FD\u4E3A\u7A7A\u3002\u9ED8\u8BA4 https://api.diting.cc";
    if (!/^https?:\/\//i.test(text)) {
      return "\u8981\u586B http:// \u6216 https:// \u5F00\u5934\u7684\u5730\u5740\uFF0C\u4F8B\u5982 https://api.diting.cc";
    }
  }
  if (key === "sectionMinutes") {
    const raw = String(value != null ? value : "").trim();
    if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return "\u586B 0 \u6216\u66F4\u5927\u7684\u6574\u6570\uFF080 = \u4E0D\u5207\u7AE0\u8282\uFF09";
    }
  }
  return;
}

// src/settings.ts
var CONSOLE_URL = "https://aiditing.cn/workspace?from=obsidian&c=20261115-obsidian-plugin";
var DEFAULT_SETTINGS = {
  apiBase: "https://api.diting.cc",
  apiKey: "",
  targetFolder: "00-Inbox",
  sectionMinutes: 10,
  confirmBeforeWrite: true,
  openAfterCreate: true,
  embedSource: true
};
var AiditingSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /**
   * 声明式设置（Obsidian 1.13+）。
   *
   * 为什么必须实现它：社区审核 2026-11-16 的 Warning 原话是
   * 「This PluginSettingTab does not implement getSettingDefinitions(); its settings will not
   * appear in Obsidian's settings search for users on 1.13.0 or later」——
   * 也就是说只实现 display() 的插件，用户在新版设置里搜「API Key」什么都搜不到。
   *
   * 为什么不再保留 display()：1.13.0 的 API 一旦出现，审核的静态扫描
   * （obsidianmd/no-unsupported-api）就会拿 minAppVersion 来卡——
   * 只写 display() 是 Warning，用了 1.13 的 API 却声明 1.8.7 就是 **Error**，
   * 直接 Failed。运行时「旧版不会调用」这个事实扫描器看不见。
   * 所以 manifest 的 minAppVersion 已提到 1.13.0，display() 整个删除，
   * 只留这一套；1.12 及以下用户停留在 0.1.15（功能完整，只是没有新版声明式设置）。
   *
   * 新增/修改设置项时只改这里，别再写 display()——那会让上面的 Error 复现。
   */
  getSettingDefinitions() {
    return [
      {
        name: "API Key",
        desc: "\u5728\u7231\u8C1B\u542C\u5DE5\u4F5C\u53F0\u767B\u5F55\u540E\u521B\u5EFA\uFF08\u514D\u8D39\u989D\u5EA6\u6BCF\u6708 30 \u5206\u949F\uFF09\u3002\u6CA1\u6709 Key \u65F6\u63D2\u4EF6\u4E0D\u4F1A\u4E0A\u4F20\u4EFB\u4F55\u6587\u4EF6\u3002",
        control: { type: "text", key: "apiKey", placeholder: "sk-diting-..." }
      },
      {
        name: "\u8FD8\u6CA1\u6709 Key\uFF1F\u4E24\u6B65\u641E\u5B9A",
        desc: "\u2460 \u70B9\u300C\u53BB\u521B\u5EFA\u300D\uFF0C\u5728\u5DE5\u4F5C\u53F0\u767B\u5F55\u540E\u521B\u5EFA Key \u5E76\u590D\u5236 \u2192 \u2461 \u56DE\u6765\u70B9\u300C\u4ECE\u526A\u8D34\u677F\u8BFB\u53D6\u300D\uFF0CKey \u4F1A\u81EA\u52A8\u586B\u5230\u4E0A\u9762\u3002",
        // 声明式渲染给的是一行空 Setting，正好把两个按钮挂上去；
        // 不用 action 类型：那会让整行变成可点击区域，用户点说明文字也会跳走。
        render: (setting) => {
          setting.addButton(
            (button) => button.setButtonText("\u53BB\u521B\u5EFA").setCta().onClick(() => {
              window.open(CONSOLE_URL, "_blank");
            })
          );
          setting.addButton(
            (button) => button.setButtonText("\u4ECE\u526A\u8D34\u677F\u8BFB\u53D6").onClick(async () => {
              if (await this.plugin.applyApiKeyFromClipboard()) this.update();
            })
          );
        }
      },
      {
        name: "API \u5730\u5740",
        desc: "\u9ED8\u8BA4 https://api.diting.cc\u3002\u9664\u975E\u6211\u4EEC\u53E6\u884C\u901A\u77E5\uFF0C\u4E0D\u8981\u6539\u8FD9\u91CC\u3002",
        control: {
          type: "text",
          key: "apiBase",
          placeholder: "https://api.diting.cc",
          // 填错会让所有请求打到不存在的地址，用户看到的只是「请求失败」——这里挡一下比事后排查便宜
          validate: (value) => validateSetting("apiBase", value)
        }
      },
      {
        name: "\u7B14\u8BB0\u843D\u5E93\u76EE\u5F55",
        desc: "\u751F\u6210\u7684 Markdown \u5199\u5230\u8FD9\u91CC\u3002\u76EE\u5F55\u4E0D\u5B58\u5728\u4F1A\u81EA\u52A8\u521B\u5EFA\uFF1B\u53EA\u65B0\u589E\u6587\u4EF6\uFF0C\u4E0D\u6539\u5DF2\u6709\u7B14\u8BB0\u3002",
        control: { type: "text", key: "targetFolder", placeholder: "00-Inbox" }
      },
      {
        name: "\u7AE0\u8282\u5207\u5206\u95F4\u9694\uFF08\u5206\u949F\uFF09",
        desc: "\u6309\u65F6\u95F4\u6233\u6BCF N \u5206\u949F\u5207\u4E00\u4E2A\u5C0F\u8282\uFF0C\u6807\u9898\u53D6\u8BE5\u6BB5\u7B2C\u4E00\u53E5\u3002\u586B 0 \u5219\u4E0D\u5207\u7AE0\u8282\u3002",
        control: { type: "number", key: "sectionMinutes", placeholder: "10", min: 0 }
      },
      {
        name: "\u5199\u5165\u524D\u786E\u8BA4\u8DEF\u5F84",
        desc: "\u4EC5\u672C\u5730\u4E0A\u4F20\u751F\u6548\uFF1A\u843D\u76D8\u524D\u663E\u793A\u6700\u7EC8\u8DEF\u5F84\uFF0C\u70B9\u786E\u8BA4\u624D\u5199\u3002\u94FE\u63A5\u8F6C\u5199\u4E0D\u5F39\u7A97\uFF08\u53EF\u80FD\u4E00\u6B21\u5199\u591A\u7BC7\uFF09\uFF0C\u9ED8\u8BA4\u5199\u5165 00-Inbox\uFF0C\u91CD\u540D\u81EA\u52A8\u52A0\u5E8F\u53F7\uFF0C\u4E0D\u4F1A\u8986\u76D6\u5DF2\u6709\u7B14\u8BB0\u3002",
        control: { type: "toggle", key: "confirmBeforeWrite" }
      },
      {
        name: "\u751F\u6210\u540E\u6253\u5F00\u7B14\u8BB0",
        control: { type: "toggle", key: "openAfterCreate" }
      },
      {
        name: "\u7B14\u8BB0\u9876\u90E8\u5D4C\u5165\u539F\u5A92\u4F53",
        desc: "\u628A\u539F\u97F3\u89C6\u9891\u5D4C\u8FDB\u7B14\u8BB0\uFF0C\u65B9\u4FBF\u5BF9\u7167\u9010\u53E5\u65F6\u95F4\u70B9\u62D6\u52A8\u65F6\u95F4\u8F74\u56DE\u542C\u3002\u5173\u6389\u5219\u53EA\u4FDD\u7559 frontmatter \u91CC\u7684 source \u6EAF\u6E90\u4FE1\u606F\u3002",
        control: { type: "toggle", key: "embedSource" }
      },
      {
        name: "\u5173\u4E8E\u8017\u65F6\u4E0E\u521D\u7A3F",
        desc: "\u6574\u7406\u7ED3\u679C\u662F\u4E00\u4EFD\u53EF\u6539\u7684\u521D\u7A3F\uFF0C\u4E0D\u662F\u7EC8\u7A3F\uFF1B\u5B9E\u9645\u8017\u65F6\u53D6\u51B3\u4E8E\u6587\u4EF6\u65F6\u957F\u3001\u7F51\u7EDC\u4E0E\u5F53\u524D\u961F\u5217\uFF0C\u63D2\u4EF6\u4E0D\u663E\u793A\u9884\u8BA1\u5B8C\u6210\u65F6\u95F4\u3002"
      }
    ];
  }
  /** 声明式控件读值：映射到插件自己的设置对象（不走 Obsidian 的 vault config） */
  getControlValue(key) {
    return this.plugin.settings[key];
  }
  /** 声明式控件写值：清洗 → 落内存 → 落盘 */
  setControlValue(key, value) {
    const store = this.plugin.settings;
    if (!(key in store)) return;
    store[key] = normalizeSettingValue(key, value);
    return this.plugin.saveSettings();
  }
};

// src/main.ts
function isMedia(file) {
  return isMediaName(file.name);
}
var AiditingPlugin = class extends import_obsidian3.Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AiditingSettingTab(this.app, this));
    setSeekNotifier((message, ms) => new import_obsidian3.Notice(message, ms != null ? ms : 8e3));
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.apiKey) return;
      const notice = new import_obsidian3.Notice(
        "\u7B2C\u4E00\u6B21\u7528 AiDiTing\uFF1F\u2460 \u70B9\u8FD9\u6761\u6D88\u606F\u6253\u5F00\u5DE5\u4F5C\u53F0\uFF08\u6BCF\u6708 30 \u5206\u949F\u514D\u8D39\uFF09\u2461 \u767B\u5F55\u540E\u521B\u5EFA Key \u5E76\u590D\u5236 \u2462 \u56DE\u6765\u8FD0\u884C\u547D\u4EE4\u300C\u7C98\u8D34 API Key\uFF08\u4ECE\u526A\u8D34\u677F\uFF09\u300D",
        2e4
      );
      notice.messageEl.addClass("aiditing-notice-link");
      notice.messageEl.addEventListener("click", () => {
        window.open(CONSOLE_URL, "_blank");
        notice.hide();
      });
    });
    this.registerMarkdownPostProcessor((el) => {
      var _a, _b;
      const root = (_b = (_a = el.closest(".markdown-preview-sizer")) != null ? _a : el.closest(".markdown-preview-view")) != null ? _b : el;
      attachSeekHandlers(root);
    });
    this.registerDomEvent(
      document,
      "mousedown",
      (evt) => {
        var _a, _b, _c;
        const target = evt.target;
        const code = (_a = target == null ? void 0 : target.closest) == null ? void 0 : _a.call(target, "code");
        if (!code) return;
        if (code.dataset.aiditingSeek === "1") return;
        const seconds = parseTimestamp((_b = code.textContent) != null ? _b : "");
        if (seconds === null) return;
        const scopeEl = (_c = code.closest(".workspace-leaf")) != null ? _c : document.body;
        const player = pickPlayer(scopeEl, code);
        if (!player) return;
        seekTo(player, seconds);
      },
      true
    );
    this.addCommand({
      id: "open-console",
      name: "\u6253\u5F00\u5DE5\u4F5C\u53F0\uFF08\u83B7\u53D6 API Key\uFF09",
      callback: () => {
        window.open(CONSOLE_URL, "_blank");
      }
    });
    this.addCommand({
      id: "paste-api-key",
      name: "\u7C98\u8D34 API Key\uFF08\u4ECE\u526A\u8D34\u677F\uFF09",
      callback: () => {
        void this.applyApiKeyFromClipboard();
      }
    });
    this.addCommand({
      id: "seek-diagnostics",
      name: "\u68C0\u67E5\u65F6\u95F4\u70B9\u8DF3\u8F6C\u72B6\u6001",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
        if (!view) {
          new import_obsidian3.Notice("\u5148\u6253\u5F00\u4E00\u7BC7\u7B14\u8BB0\uFF0C\u518D\u8FD0\u884C\u8FD9\u4E2A\u68C0\u67E5\u3002");
          return;
        }
        const info = inspectScope(view.containerEl);
        const mode = view.getMode() === "preview" ? "\u9605\u8BFB\u6A21\u5F0F" : "\u7F16\u8F91\u6A21\u5F0F\uFF08Live Preview\uFF09";
        new import_obsidian3.Notice(
          `\u6A21\u5F0F\uFF1A${mode}
\u65F6\u95F4\u70B9\uFF1A${info.timestamps} \u4E2A\uFF08\u5DF2\u6302\u70B9\u51FB ${info.wired} \u4E2A\uFF09
\u64AD\u653E\u5668\uFF1A${info.mediaCount} \u4E2A`,
          12e3
        );
      }
    });
    this.addCommand({
      id: "seek-media-dump",
      name: "\u5BFC\u51FA\u64AD\u653E\u5668\u72B6\u6001\uFF08\u590D\u5236\u5230\u526A\u8D34\u677F\uFF09",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
        if (!view) {
          new import_obsidian3.Notice("\u5148\u6253\u5F00\u4E00\u7BC7\u7B14\u8BB0\uFF0C\u518D\u8FD0\u884C\u8FD9\u4E2A\u3002");
          return;
        }
        const media = Array.from(view.containerEl.querySelectorAll("video, audio"));
        if (media.length === 0) {
          new import_obsidian3.Notice("\u8FD9\u7BC7\u7B14\u8BB0\u91CC\u6CA1\u6709 video / audio \u5143\u7D20\u3002", 8e3);
          return;
        }
        const range = (r) => {
          const out = [];
          for (let i = 0; i < r.length; i += 1) out.push(`${r.start(i).toFixed(2)}-${r.end(i).toFixed(2)}`);
          return out.length ? out.join(", ") : "(\u7A7A)";
        };
        const lines = [`media \u5143\u7D20: ${media.length} \u4E2A`];
        media.forEach((m, i) => {
          var _a;
          const path = (_a = m.getAttribute("src")) != null ? _a : "";
          const r = m.getBoundingClientRect();
          lines.push(
            `[${i}] ${m.tagName}  currentTime=${m.currentTime.toFixed(2)}  duration=${String(m.duration)}  paused=${m.paused}`,
            `    readyState=${m.readyState} networkState=${m.networkState} error=${m.error ? m.error.code : "none"}`,
            `    videoWidth=${m.videoWidth} videoHeight=${m.videoHeight}`,
            `    rect=${Math.round(r.width)}x${Math.round(r.height)} top=${Math.round(r.top)} \u53EF\u89C1=${r.width > 0 && r.height > 0}`,
            `    seekable=[${range(m.seekable)}]  buffered=[${range(m.buffered)}]`,
            `    src=${path.slice(0, 100)}`
          );
        });
        const text = lines.join("\n");
        void navigator.clipboard.writeText(text).then(
          () => new import_obsidian3.Notice(`\u5DF2\u590D\u5236 ${media.length} \u4E2A\u64AD\u653E\u5668\u7684\u72B6\u6001\u5230\u526A\u8D34\u677F\uFF0C\u7C98\u8D34\u53D1\u6211\u3002`, 1e4),
          () => new import_obsidian3.Notice(`\u590D\u5236\u5931\u8D25\uFF0C\u5185\u5BB9\uFF1A
${text.slice(0, 400)}`, 2e4)
        );
      }
    });
    this.addCommand({
      id: "transcribe-active-media",
      name: "\u6574\u7406\u5F53\u524D\u97F3\u89C6\u9891\u6587\u4EF6",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !isMedia(file)) return false;
        if (!checking) void this.run(file);
        return true;
      }
    });
    this.addCommand({
      id: "transcribe-pick-media",
      name: "\u4ECE Vault \u91CC\u9009\u4E00\u4E2A\u97F3\u89C6\u9891\u6574\u7406",
      callback: () => {
        new MediaPickerModal(this.app, this).open();
      }
    });
    this.addCommand({
      id: "transcribe-from-link",
      name: "\u4ECE\u94FE\u63A5\u6574\u7406\uFF08B\u7AD9 / \u6296\u97F3 / \u5C0F\u7EA2\u4E66\uFF09",
      callback: () => {
        if (!import_obsidian3.Platform.isDesktopApp) {
          new import_obsidian3.Notice("\u4EC5\u652F\u6301\u684C\u9762\u7AEF Obsidian\u3002");
          return;
        }
        if (!this.settings.apiKey) {
          new import_obsidian3.Notice("\u5148\u586B API Key\uFF1A\u8FD0\u884C\u547D\u4EE4\u300C\u7C98\u8D34 API Key\uFF08\u4ECE\u526A\u8D34\u677F\uFF09\u300D\uFF0C\u6216\u5728\u8BBE\u7F6E\u91CC\u586B\u3002", 1e4);
          return;
        }
        new LinkTranscribeModal(this.app, this).open();
      }
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof import_obsidian3.TFile) || !isMedia(file)) return;
        menu.addItem(
          (item) => item.setTitle("\u7231\u8C1B\u542C\uFF1A\u6574\u7406\u6210\u7B14\u8BB0").setIcon("audio-file").onClick(() => void this.run(file))
        );
      })
    );
  }
  /**
   * 从剪贴板取 API Key 并保存。
   *
   * 为什么要这个：用户在工作台复制 Key 之后，还得切回 Obsidian、翻进设置页、
   * 把光标点进输入框、粘贴——这几步里每一步都会掉一批人。
   * 这里把「复制 → 回来点一下」压成两步，第一次使用就能跑通。
   */
  async applyApiKeyFromClipboard() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      new import_obsidian3.Notice("\u8BFB\u4E0D\u5230\u526A\u8D34\u677F\uFF08\u7CFB\u7EDF\u6CA1\u7ED9\u6743\u9650\uFF09\u3002\u8BF7\u5728\u8BBE\u7F6E\u91CC\u624B\u52A8\u7C98\u8D34 Key\u3002", 1e4);
      return false;
    }
    const key = text.trim();
    if (!/^sk-[A-Za-z0-9_-]{8,}$/.test(key)) {
      const preview = key ? `${key.slice(0, 24)}${key.length > 24 ? "\u2026" : ""}` : "\uFF08\u7A7A\uFF09";
      new import_obsidian3.Notice(
        `\u526A\u8D34\u677F\u91CC\u4E0D\u662F API Key\u3002\u5148\u5728\u5DE5\u4F5C\u53F0\u70B9\u300C\u521B\u5EFA Key\u300D\u5E76\u590D\u5236\uFF0C\u518D\u56DE\u6765\u8FD0\u884C\u8FD9\u6761\u547D\u4EE4\u3002
\u8BFB\u5230\u7684\u662F\uFF1A${preview}`,
        12e3
      );
      return false;
    }
    this.settings.apiKey = key;
    await this.saveSettings();
    new import_obsidian3.Notice("API Key \u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u6574\u7406\u97F3\u89C6\u9891\u4E86\u3002", 6e3);
    return true;
  }
  async loadSettings() {
    const stored = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored != null ? stored : {});
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  listMedia() {
    return this.app.vault.getFiles().filter(isMedia);
  }
  /** 主流程：读文件 → 上传 → 等待 → 生成 → 确认路径 → 写新文件 */
  async run(file) {
    var _a;
    if (!import_obsidian3.Platform.isDesktopApp) {
      new import_obsidian3.Notice("\u4EC5\u652F\u6301\u684C\u9762\u7AEF Obsidian\uFF1B\u624B\u673A\u7AEF\u4E0D\u52A0\u8F7D\u8FD9\u4E2A\u63D2\u4EF6\u3002");
      return;
    }
    if (!this.settings.apiKey) {
      new import_obsidian3.Notice(
        "\u8FD8\u6CA1\u586B API Key\u3002\u8BBE\u7F6E \u2192 \u7B2C\u4E09\u65B9\u63D2\u4EF6 \u2192 AiDiTing \u2192 \u9009\u9879\uFF0C\u586B\u4E0A\u5373\u53EF\uFF1B\u6CA1\u6709 Key \u53EF\u53BB aiditing.cn/workspace \u521B\u5EFA\uFF08\u514D\u8D39\u989D\u5EA6\u6BCF\u6708 30 \u5206\u949F\uFF09\u3002",
        12e3
      );
      return;
    }
    const size = file.stat.size;
    if (size > MAX_FILE_BYTES) {
      new import_obsidian3.Notice(
        `\u8FD9\u4E2A\u6587\u4EF6 ${(size / 1024 / 1024).toFixed(0)}MB\uFF0C\u8D85\u8FC7 200MB \u4E0A\u9650\u3002\u5148\u88C1\u526A\u6216\u8F6C\u7801\u540E\u518D\u8BD5\u3002`,
        1e4
      );
      return;
    }
    const api = new AiditingApi(this.settings.apiBase, this.settings.apiKey, obsidianTransport);
    const progress = new import_obsidian3.Notice(`\u6B63\u5728\u8BFB\u53D6 ${file.name}\u2026`, 0);
    try {
      const data = await this.app.vault.readBinary(file);
      progress.setMessage(`\u6B63\u5728\u4E0A\u4F20 ${file.name}\uFF08${(size / 1024 / 1024).toFixed(1)}MB\uFF09\u2026`);
      const taskId = await api.upload(file.name, mimeOf(file.name), data);
      progress.setMessage("\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u6574\u7406\u3002\u53EF\u4EE5\u5148\u53BB\u5E72\u522B\u7684\uFF0C\u597D\u4E86\u4F1A\u63D0\u793A\u3002");
      const task = await api.waitForTask(taskId, (t) => {
        progress.setMessage(`\u6574\u7406\u4E2D\u2026 ${describeTask(t)}`);
      });
      if (task.status !== "completed") {
        progress.hide();
        new import_obsidian3.Notice(`\u6574\u7406\u5931\u8D25\uFF1A${(_a = task.errorMessage) != null ? _a : task.status}\u3002\u989D\u5EA6\u4E0D\u53D7\u5F71\u54CD\u3002`, 12e3);
        return;
      }
      const note = buildNote(task, {
        sourceName: file.name,
        title: safeFileName(baseName(file.name)),
        taskId,
        apiBase: this.settings.apiBase,
        sectionMinutes: this.settings.sectionMinutes,
        embedSource: this.settings.embedSource
      });
      const proposed = this.buildPath(file);
      const target = this.settings.confirmBeforeWrite ? await this.confirmPath(proposed) : proposed;
      if (!target) {
        progress.hide();
        new import_obsidian3.Notice("\u5DF2\u53D6\u6D88\uFF0C\u6CA1\u6709\u5199\u5165\u4EFB\u4F55\u6587\u4EF6\u3002");
        return;
      }
      const folder = (0, import_obsidian3.normalizePath)(target.split("/").slice(0, -1).join("/") || "/");
      await this.ensureFolder(folder);
      const created = await this.app.vault.create(target, note);
      progress.hide();
      new import_obsidian3.Notice(`\u5DF2\u5199\u5165 ${target}`);
      if (this.settings.openAfterCreate) {
        await this.app.workspace.getLeaf(true).openFile(created);
      }
    } catch (err) {
      progress.hide();
      new import_obsidian3.Notice(err instanceof Error ? err.message : String(err), 12e3);
    }
  }
  /** 检查链接：识别平台 + 预检。错误抛给调用方去显示，这里不弹 Notice */
  async checkLink(raw) {
    const match = detectPlatform(raw);
    if (!match) {
      throw new Error("\u8FD9\u4E2A\u94FE\u63A5\u8BA4\u4E0D\u51FA\u6765\u3002\u76EE\u524D\u53EA\u652F\u6301 B\u7AD9 / \u6296\u97F3 / \u5C0F\u7EA2\u4E66\uFF0C\u5176\u4ED6\u7AD9\u70B9\u8BF7\u7528\u7F51\u9875\u7AEF\u3002");
    }
    const api = new AiditingApi(this.settings.apiBase, this.settings.apiKey, obsidianTransport);
    const result = await api.checkPlatform(match);
    return { match, result };
  }
  /**
   * 远程视频（B站 / 抖音 / 小红书）：提交 → 逐集轮询 → 每集写一篇笔记。
   *
   * 为什么多P 拆成多个文件：一集两小时已经很长，30 集合成一篇既打不开也搜不动。
   * 这和本地批量上传的行为一致——一集就是一篇。
   */
  async transcribeRemote(match, parts, fallbackTitle) {
    var _a, _b;
    if (!import_obsidian3.Platform.isDesktopApp) {
      new import_obsidian3.Notice("\u4EC5\u652F\u6301\u684C\u9762\u7AEF Obsidian\uFF1B\u624B\u673A\u7AEF\u4E0D\u52A0\u8F7D\u8FD9\u4E2A\u63D2\u4EF6\u3002");
      return;
    }
    const api = new AiditingApi(this.settings.apiBase, this.settings.apiKey, obsidianTransport);
    const progress = new import_obsidian3.Notice(`\u6B63\u5728\u63D0\u4EA4\u5230 ${platformLabel(match.platform)}\u2026`, 0);
    try {
      const { taskIds: ids, fileNames } = await api.submitPlatform(match, parts);
      if (ids.length === 0) {
        throw new Error("\u63D0\u4EA4\u6210\u529F\u4F46\u6CA1\u62FF\u5230\u4EFB\u52A1\u53F7\uFF0C\u8BF7\u628A\u94FE\u63A5\u53CD\u9988\u7ED9\u6211\u4EEC\u3002");
      }
      const written = [];
      for (let i = 0; i < ids.length; i += 1) {
        const part = matchPart(parts, fileNames[i], i);
        const label = ids.length > 1 ? `\uFF08${i + 1}/${ids.length}\uFF09` : "";
        progress.setMessage(`\u5DF2\u63D0\u4EA4${label}\uFF0C\u7B49\u5F85\u6574\u7406\u2026`);
        const task = await api.waitForTask(ids[i], (t) => {
          progress.setMessage(`\u6574\u7406\u4E2D${label} ${describeTask(t)}`);
        });
        if (task.status !== "completed") {
          new import_obsidian3.Notice(
            `${(part == null ? void 0 : part.title) || `\u7B2C ${i + 1} \u96C6`} \u6574\u7406\u5931\u8D25\uFF1A${(_a = task.errorMessage) != null ? _a : task.status}\u3002\u989D\u5EA6\u4E0D\u53D7\u5F71\u54CD\u3002`,
            12e3
          );
          continue;
        }
        const title = safeFileName((part == null ? void 0 : part.title) || fallbackTitle || "\u89C6\u9891");
        const note = buildNote(task, {
          sourceName: (part == null ? void 0 : part.title) || fallbackTitle || "\u89C6\u9891",
          title,
          taskId: ids[i],
          apiBase: this.settings.apiBase,
          sectionMinutes: this.settings.sectionMinutes,
          // 远程视频：不嵌本地媒体，时间点按平台能力渲染（见 platform.ts）
          remote: {
            platform: match.platform,
            bvid: (_b = part == null ? void 0 : part.bvid) != null ? _b : match.bvid,
            // 单P 不带分P参数，否则链接里会多一个 ?p=1
            page: parts.length > 1 ? part == null ? void 0 : part.page : void 0
          },
          sourceUrl: (part == null ? void 0 : part.url) || match.url
        });
        const target = this.buildPathForTitle(title);
        const folder = (0, import_obsidian3.normalizePath)(target.split("/").slice(0, -1).join("/") || "/");
        await this.ensureFolder(folder);
        await this.app.vault.create(target, note);
        written.push(target);
      }
      progress.hide();
      new import_obsidian3.Notice(
        written.length > 0 ? `\u5DF2\u5199\u5165 ${written.length} \u7BC7\uFF1A${written[0]}${written.length > 1 ? " \u7B49" : ""}` : "\u6CA1\u6709\u5199\u5165\u4EFB\u4F55\u7B14\u8BB0\u3002",
        1e4
      );
      if (this.settings.openAfterCreate && written.length === 1) {
        const file = this.app.vault.getAbstractFileByPath(written[0]);
        if (file instanceof import_obsidian3.TFile) await this.app.workspace.getLeaf(true).openFile(file);
      }
    } catch (err) {
      progress.hide();
      new import_obsidian3.Notice(err instanceof Error ? err.message : String(err), 12e3);
    }
  }
  /** 目标路径：目标目录 + 标题 + .md；重名时加序号，绝不覆盖已有笔记 */
  buildPath(file) {
    return this.buildPathForTitle(baseName(file.name));
  }
  /** 同上，但标题直接给（远程视频没有 TFile） */
  buildPathForTitle(title) {
    const folder = (0, import_obsidian3.normalizePath)(this.settings.targetFolder || "00-Inbox");
    const base = safeFileName(title);
    let candidate = (0, import_obsidian3.normalizePath)(`${folder}/${base}.md`);
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = (0, import_obsidian3.normalizePath)(`${folder}/${base}-${i}.md`);
      i += 1;
    }
    return candidate;
  }
  async ensureFolder(folder) {
    if (!folder || folder === "/") return;
    let current = "";
    for (const part of folder.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  confirmPath(proposed) {
    return new Promise((resolve) => {
      new PathConfirmModal(this.app, proposed, resolve).open();
    });
  }
};
function describeTask(task) {
  if (typeof task.progress === "number" && task.progress > 0) return `${Math.round(task.progress)}%`;
  if (task.status === "queued") return "\u6392\u961F\u4E2D";
  return "\u5904\u7406\u4E2D";
}
var LinkTranscribeModal = class extends import_obsidian3.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.raw = "";
    this.match = null;
    this.result = null;
    this.checked = /* @__PURE__ */ new Set();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "\u4ECE\u94FE\u63A5\u6574\u7406" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "\u652F\u6301 B\u7AD9\u3001\u6296\u97F3\u3001\u5C0F\u7EA2\u4E66\u3002\u53EF\u4EE5\u76F4\u63A5\u7C98\u8D34 App \u91CC\u590D\u5236\u7684\u6574\u6BB5\u5206\u4EAB\u6587\u6848\u3002"
    });
    new import_obsidian3.Setting(contentEl).setName("\u89C6\u9891\u94FE\u63A5").addText((text) => {
      text.setPlaceholder("https://www.bilibili.com/video/BV...").onChange((value) => {
        this.raw = value;
      });
      window.setTimeout(() => text.inputEl.focus(), 50);
    });
    this.resultEl = contentEl.createDiv();
    new import_obsidian3.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("\u68C0\u67E5\u94FE\u63A5").onClick(() => {
        void this.doCheck();
      })
    ).addButton(
      (btn) => btn.setButtonText("\u5F00\u59CB\u6574\u7406").setCta().onClick(() => {
        void this.doSubmit();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
  async doCheck() {
    const raw = this.raw.trim();
    if (!raw) {
      new import_obsidian3.Notice("\u5148\u7C98\u8D34\u4E00\u4E2A\u94FE\u63A5\u3002");
      return;
    }
    this.resultEl.empty();
    this.resultEl.createEl("p", { text: "\u68C0\u67E5\u4E2D\u2026" });
    this.checked.clear();
    try {
      const { match, result } = await this.plugin.checkLink(raw);
      this.match = match;
      this.result = result;
      this.renderResult();
    } catch (err) {
      this.match = null;
      this.result = null;
      this.resultEl.empty();
      this.resultEl.createEl("p", { text: err instanceof Error ? err.message : String(err) });
    }
  }
  renderResult() {
    const result = this.result;
    if (!result) return;
    this.resultEl.empty();
    const totalSeconds = result.parts.reduce((sum, p) => sum + p.seconds, 0);
    this.resultEl.createEl("p", {
      text: `${result.title || "\u672A\u547D\u540D"} \xB7 ${result.parts.length} \u96C6 \xB7 \u5408\u8BA1\u7EA6 ${Math.round(totalSeconds / 60)} \u5206\u949F`
    });
    this.resultEl.createEl("p", {
      cls: "setting-item-description",
      text: "\u52FE\u9009\u8981\u6574\u7406\u7684\u90E8\u5206\uFF08\u9ED8\u8BA4\u4E0D\u52FE\uFF09\uFF0C\u6BCF\u96C6\u751F\u6210\u4E00\u7BC7\u7B14\u8BB0\u3002"
    });
    for (const part of result.parts) {
      const row = this.resultEl.createDiv({ cls: "aiditing-part-row" });
      const box = row.createEl("input", { type: "checkbox" });
      box.checked = this.checked.has(part.page);
      box.addEventListener("change", () => {
        if (box.checked) this.checked.add(part.page);
        else this.checked.delete(part.page);
      });
      row.createSpan({ text: ` P${part.page} ${part.title}\uFF08${part.durationText}\uFF09` });
    }
  }
  async doSubmit() {
    if (!this.match || !this.result) {
      new import_obsidian3.Notice("\u5148\u70B9\u300C\u68C0\u67E5\u94FE\u63A5\u300D\u3002");
      return;
    }
    const parts = this.result.parts.filter((p) => this.checked.has(p.page));
    if (parts.length === 0) {
      new import_obsidian3.Notice("\u81F3\u5C11\u52FE\u9009\u4E00\u96C6\u3002");
      return;
    }
    this.close();
    await this.plugin.transcribeRemote(this.match, parts, this.result.title);
  }
};
var MediaPickerModal = class extends import_obsidian3.FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder("\u9009\u4E00\u4E2A\u97F3\u9891\u6216\u89C6\u9891\u6587\u4EF6\u2026");
  }
  getItems() {
    return this.plugin.listMedia();
  }
  getItemText(item) {
    return item.path;
  }
  onChooseItem(item) {
    void this.plugin.run(item);
  }
};
var PathConfirmModal = class extends import_obsidian3.Modal {
  constructor(app, initial, onDone) {
    super(app);
    this.onDone = onDone;
    this.submitted = false;
    this.value = initial;
  }
  onOpen() {
    this.titleEl.setText("\u786E\u8BA4\u843D\u5E93\u8DEF\u5F84");
    this.contentEl.createEl("p", {
      text: "\u53EA\u65B0\u589E\u8FD9\u4E00\u7BC7\u7B14\u8BB0\uFF0C\u4E0D\u4F1A\u6539\u52A8\u3001\u79FB\u52A8\u4F60\u5DF2\u6709\u7684\u7B14\u8BB0\u3002",
      cls: "setting-item-description"
    });
    new import_obsidian3.Setting(this.contentEl).setName("\u6587\u4EF6\u8DEF\u5F84").addText((text) => {
      text.setValue(this.value).onChange((v) => {
        this.value = v.trim();
      });
      text.inputEl.addClass("aiditing-path-input");
    });
    new import_obsidian3.Setting(this.contentEl).addButton(
      (btn) => btn.setButtonText("\u5199\u5165").setCta().onClick(() => {
        this.submitted = Boolean(this.value);
        this.close();
      })
    ).addButton(
      (btn) => btn.setButtonText("\u53D6\u6D88").onClick(() => {
        this.submitted = false;
        this.close();
      })
    );
  }
  onClose() {
    const result = this.submitted && this.value ? (0, import_obsidian3.normalizePath)(this.value) : null;
    this.contentEl.empty();
    this.onDone(result);
  }
};

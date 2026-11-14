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

// src/api.ts
var MAX_FILE_BYTES = 200 * 1024 * 1024;
var UPLOAD_TIMEOUT_NOTE = "\u4E0A\u4F20\u4E2D\u65AD\u3002\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\uFF0C\u6216\u5148\u7528\u7F51\u9875\u5165\u53E3\u786E\u8BA4 Key \u662F\u5426\u53EF\u7528\u3002";
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
          "Content-Type": `multipart/form-data; boundary=${boundary}`
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
      headers: { Authorization: `Bearer ${this.key}` }
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
};
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
    if (typeof v === "string" && v) return v;
  }
  return void 0;
}
function describe(err) {
  return err instanceof Error ? err.message : String(err);
}
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
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

// src/note.ts
var TIMESTAMP_LINE = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;
function parseTimedLines(raw) {
  if (!raw) return [];
  const lines = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = TIMESTAMP_LINE.exec(line);
    if (m) {
      lines.push({ ts: m[1], seconds: toSeconds(m[1]), text: m[2].trim() });
      continue;
    }
    const last = lines[lines.length - 1];
    if (last) last.text = `${last.text} ${line}`.trim();
  }
  return lines;
}
function toSeconds(ts) {
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
    `duration: ${q(duration)}`,
    `created: ${created}`,
    "tags:",
    "  - \u5F85\u6574\u7406",
    `aiditing_task: ${q(meta.taskId)}`,
    `aiditing_api: ${q(meta.apiBase)}`,
    "---"
  ];
  const body = [
    "",
    "> [!warning] \u8FD9\u662F AI \u6574\u7406\u7684\u521D\u7A3F",
    "> \u8F6C\u5199\u548C\u672F\u8BED\u7EA0\u6B63\u90FD\u53EF\u80FD\u51FA\u9519\uFF0C\u6B63\u5F0F\u5F15\u7528\u524D\u8BF7\u6838\u5BF9\u539F\u97F3\u3002\u6BCF\u6761\u90FD\u5E26\u65F6\u95F4\u70B9\uFF0C\u70B9\u56DE\u53BB\u5C31\u80FD\u542C\u5230\u539F\u8BDD\u3002",
    ""
  ];
  if (summary) {
    body.push("## \u6458\u8981", "", summary, "");
  }
  if (timed.length > 0) {
    body.push("## \u6B63\u6587", "");
    const groups = groupByMinutes(timed, meta.sectionMinutes);
    groups.forEach((group, i) => {
      body.push(`### [${group[0].ts}] ${sectionTitle(group[0], i, meta.sectionMinutes)}`, "");
      for (const line of group) {
        body.push(`- \`${line.ts}\` ${line.text}`);
      }
      body.push("");
    });
  } else {
    body.push("## \u6B63\u6587", "", plain, "");
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

// src/settings.ts
var import_obsidian2 = require("obsidian");
var CONSOLE_URL = "https://aiditing.cn/workspace";
var DEFAULT_SETTINGS = {
  apiBase: "https://api.diting.cc",
  apiKey: "",
  targetFolder: "00-Inbox",
  sectionMinutes: 10,
  confirmBeforeWrite: true,
  openAfterCreate: true
};
var AiditingSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("API Key").setDesc("\u5728\u7231\u8C1B\u542C\u5DE5\u4F5C\u53F0\u767B\u5F55\u540E\u521B\u5EFA\uFF08\u514D\u8D39\u989D\u5EA6\u6BCF\u6708 30 \u5206\u949F\uFF09\u3002\u6CA1\u6709 Key \u65F6\u63D2\u4EF6\u4E0D\u4F1A\u4E0A\u4F20\u4EFB\u4F55\u6587\u4EF6\u3002").addText(
      (text) => text.setPlaceholder("sk-diting-...").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u8FD8\u6CA1\u6709 Key\uFF1F").setDesc("\u6253\u5F00\u5DE5\u4F5C\u53F0\u521B\u5EFA\uFF0C\u521B\u5EFA\u540E\u590D\u5236\u56DE\u6765\u7C98\u8D34\u5230\u4E0A\u9762\u3002").addButton(
      (button) => button.setButtonText("\u53BB\u521B\u5EFA").setCta().onClick(() => {
        window.open(CONSOLE_URL, "_blank");
      })
    );
    new import_obsidian2.Setting(containerEl).setName("API \u5730\u5740").setDesc("\u9ED8\u8BA4 https://api.diting.cc\u3002\u9664\u975E\u6211\u4EEC\u53E6\u884C\u901A\u77E5\uFF0C\u4E0D\u8981\u6539\u8FD9\u91CC\u3002").addText(
      (text) => text.setPlaceholder("https://api.diting.cc").setValue(this.plugin.settings.apiBase).onChange(async (value) => {
        this.plugin.settings.apiBase = value.trim().replace(/\/+$/, "");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u7B14\u8BB0\u843D\u5E93\u76EE\u5F55").setDesc("\u751F\u6210\u7684 Markdown \u5199\u5230\u8FD9\u91CC\u3002\u76EE\u5F55\u4E0D\u5B58\u5728\u4F1A\u81EA\u52A8\u521B\u5EFA\uFF1B\u53EA\u65B0\u589E\u6587\u4EF6\uFF0C\u4E0D\u6539\u5DF2\u6709\u7B14\u8BB0\u3002").addText(
      (text) => text.setPlaceholder("00-Inbox").setValue(this.plugin.settings.targetFolder).onChange(async (value) => {
        this.plugin.settings.targetFolder = value.trim().replace(/^\/+|\/+$/g, "");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u7AE0\u8282\u5207\u5206\u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6309\u65F6\u95F4\u6233\u6BCF N \u5206\u949F\u5207\u4E00\u4E2A\u5C0F\u8282\uFF0C\u6807\u9898\u53D6\u8BE5\u6BB5\u7B2C\u4E00\u53E5\u3002\u586B 0 \u5219\u4E0D\u5207\u7AE0\u8282\u3002").addText(
      (text) => text.setPlaceholder("10").setValue(String(this.plugin.settings.sectionMinutes)).onChange(async (value) => {
        const n = Number(value);
        this.plugin.settings.sectionMinutes = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u5199\u5165\u524D\u786E\u8BA4\u8DEF\u5F84").setDesc("\u5F00\u542F\u540E\uFF0C\u843D\u76D8\u524D\u4F1A\u663E\u793A\u6700\u7EC8\u8DEF\u5F84\uFF0C\u70B9\u786E\u8BA4\u624D\u5199\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.confirmBeforeWrite).onChange(async (value) => {
        this.plugin.settings.confirmBeforeWrite = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u751F\u6210\u540E\u6253\u5F00\u7B14\u8BB0").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.openAfterCreate).onChange(async (value) => {
        this.plugin.settings.openAfterCreate = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("p", {
      text: "\u8BF4\u660E\uFF1A\u6574\u7406\u7ED3\u679C\u662F\u4E00\u4EFD\u53EF\u6539\u7684\u521D\u7A3F\uFF0C\u4E0D\u662F\u7EC8\u7A3F\uFF1B\u5B9E\u9645\u8017\u65F6\u53D6\u51B3\u4E8E\u6587\u4EF6\u65F6\u957F\u3001\u7F51\u7EDC\u4E0E\u5F53\u524D\u961F\u5217\uFF0C\u63D2\u4EF6\u4E0D\u663E\u793A\u9884\u8BA1\u5B8C\u6210\u65F6\u95F4\u3002",
      cls: "setting-item-description"
    });
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
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof import_obsidian3.TFile) || !isMedia(file)) return;
        menu.addItem(
          (item) => item.setTitle("\u7231\u8C1B\u542C\uFF1A\u6574\u7406\u6210\u7B14\u8BB0").setIcon("audio-file").onClick(() => void this.run(file))
        );
      })
    );
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
      new import_obsidian3.Notice("\u5185\u6D4B\u671F\u53EA\u9A8C\u8BC1\u4E86\u684C\u9762\u7AEF Obsidian\uFF0C\u624B\u673A\u7AEF\u6682\u4E0D\u652F\u6301\u3002");
      return;
    }
    if (!this.settings.apiKey) {
      new import_obsidian3.Notice("\u8FD8\u6CA1\u586B\u5185\u6D4B Key\u3002\u6253\u5F00 \u8BBE\u7F6E \u2192 \u7B2C\u4E09\u65B9\u63D2\u4EF6 \u2192 \u7231\u8C1B\u542C\uFF0C\u7C98\u8D34\u6211\u4EEC\u53D1\u7ED9\u4F60\u7684 Key\u3002", 1e4);
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
        sectionMinutes: this.settings.sectionMinutes
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
  /** 目标路径：目标目录 + 标题 + .md；重名时加序号，绝不覆盖已有笔记 */
  buildPath(file) {
    const folder = (0, import_obsidian3.normalizePath)(this.settings.targetFolder || "00-Inbox");
    const base = safeFileName(baseName(file.name));
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

import {
  type App,
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  Notice,
  Platform,
  Plugin,
  Setting,
  TFile,
  normalizePath,
} from "obsidian";
import { AiditingApi, MAX_FILE_BYTES, type TaskView } from "./api";
import { baseName, isMediaName, mimeOf, safeFileName } from "./media";
import { buildNote } from "./note";
import { obsidianTransport } from "./obsidian-transport";
import {
  attachSeekHandlers,
  inspectScope,
  parseTimestamp,
  pickPlayer,
  seekTo,
  setSeekNotifier,
} from "./seek";
import { AiditingSettingTab, CONSOLE_URL, DEFAULT_SETTINGS, type AiditingSettings } from "./settings";

function isMedia(file: TFile): boolean {
  return isMediaName(file.name);
}

export default class AiditingPlugin extends Plugin {
  settings!: AiditingSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new AiditingSettingTab(this.app, this));

    // seek 模块跑单测时不能依赖 obsidian 模块，所以提示通道从外面注入
    setSeekNotifier((message, ms) => new Notice(message, ms ?? 8000));

    // 首次使用引导：没有 Key 就主动说清楚怎么开始。
    //
    // 之前是被动的——用户选中文件、点了「整理」，等到的是「还没填 API Key」。
    // 那一刻他已经在等结果，收到的是一次失败，最省事的反应就是卸载。
    // 装完第一眼就该看到「下一步做什么」，而不是先失败一次。
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.apiKey) return;
      const notice = new Notice(
        "第一次用 AiDiTing？① 点这条消息打开工作台（每月 30 分钟免费）② 登录后创建 Key 并复制 ③ 回来运行命令「粘贴 API Key（从剪贴板）」",
        20000,
      );
      notice.noticeEl.style.cursor = "pointer";
      notice.noticeEl.addEventListener("click", () => {
        window.open(CONSOLE_URL, "_blank");
        notice.hide();
      });
    });

    // 阅读模式：把正文里的 `00:12` 变成可点的时间点，点了跳原生播放器到该秒。
    // 向上找预览容器，是因为嵌入的播放器和正文可能不在同一个渲染段里。
    this.registerMarkdownPostProcessor((el) => {
      const root = (el.closest(".markdown-preview-sizer") ??
        el.closest(".markdown-preview-view") ??
        el) as HTMLElement;
      attachSeekHandlers(root);
    });

    // Live Preview（编辑视图）里，行内代码是 CodeMirror 渲染的 DOM，post processor 不跑，
    // 所以另挂一个文档级捕获监听。故意**不** preventDefault：不能为了跳转而让人没法把光标放进代码里。
    this.registerDomEvent(
      document,
      "mousedown",
      (evt) => {
        const target = evt.target as HTMLElement | null;
        const code = target?.closest?.("code");
        if (!code) return;
        if (code.dataset.aiditingSeek === "1") return; // 阅读模式已接管，别重复触发
        const seconds = parseTimestamp(code.textContent ?? "");
        if (seconds === null) return;
        const scopeEl = (code.closest(".workspace-leaf") ?? document.body) as HTMLElement;
        // 用 pickPlayer 而不是 findPlayer：同一段嵌入可能渲染出两个 <video>，
        // 盲取第一个会跳到用户看不见的那个（阅读模式上已经踩过一次，见 docs）。
        const player = pickPlayer(scopeEl, code);
        if (!player) return;
        seekTo(player, seconds);
      },
      true,
    );

    // 拿 Key 的完整动线做成命令：用户不用记住「设置 → 第三方插件 → 选项」这一串路径
    this.addCommand({
      id: "open-console",
      name: "打开工作台（获取 API Key）",
      callback: () => {
        window.open(CONSOLE_URL, "_blank");
      },
    });

    this.addCommand({
      id: "paste-api-key",
      name: "粘贴 API Key（从剪贴板）",
      callback: () => {
        void this.applyApiKeyFromClipboard();
      },
    });

    // 排查用：点了没反应时，用户跑一下这个命令就能说出「模式 / 时间点 / 播放器」三件事
    this.addCommand({
      id: "seek-diagnostics",
      name: "检查时间点跳转状态",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          new Notice("先打开一篇笔记，再运行这个检查。");
          return;
        }
        const info = inspectScope(view.containerEl);
        const mode = view.getMode() === "preview" ? "阅读模式" : "编辑模式（Live Preview）";
        new Notice(
          `模式：${mode}\n时间点：${info.timestamps} 个（已挂点击 ${info.wired} 个）\n播放器：${info.mediaCount} 个`,
          12000,
        );
      },
    });

    // 排查用：seek 之后「声音跳了画面不动」时，先看这个。
    // 重点在 seekable —— Obsidian 走 app:// 读本地文件，如果该协议不支持 Range 请求，
    // currentTime 会被静默 clamp 到可跳范围末尾，player 不报错，画面自然不动。
    this.addCommand({
      id: "seek-media-dump",
      name: "导出播放器状态（复制到剪贴板）",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          new Notice("先打开一篇笔记，再运行这个。");
          return;
        }
        const media = Array.from(view.containerEl.querySelectorAll<HTMLMediaElement>("video, audio"));
        if (media.length === 0) {
          new Notice("这篇笔记里没有 video / audio 元素。", 8000);
          return;
        }
        const range = (r: TimeRanges) => {
          const out: string[] = [];
          for (let i = 0; i < r.length; i += 1) out.push(`${r.start(i).toFixed(2)}-${r.end(i).toFixed(2)}`);
          return out.length ? out.join(", ") : "(空)";
        };
        const lines = [`media 元素: ${media.length} 个`];
        media.forEach((m, i) => {
          const path = m.getAttribute("src") ?? "";
          const r = m.getBoundingClientRect();
          lines.push(
            `[${i}] ${m.tagName}  currentTime=${m.currentTime.toFixed(2)}  duration=${String(m.duration)}  paused=${m.paused}`,
            `    readyState=${m.readyState} networkState=${m.networkState} error=${m.error ? m.error.code : "none"}`,
            `    videoWidth=${(m as HTMLVideoElement).videoWidth} videoHeight=${(m as HTMLVideoElement).videoHeight}`,
            `    rect=${Math.round(r.width)}x${Math.round(r.height)} top=${Math.round(r.top)} 可见=${r.width > 0 && r.height > 0}`,
            `    seekable=[${range(m.seekable)}]  buffered=[${range(m.buffered)}]`,
            `    src=${path.slice(0, 100)}`,
          );
        });
        const text = lines.join("\n");
        void navigator.clipboard.writeText(text).then(
          () => new Notice(`已复制 ${media.length} 个播放器的状态到剪贴板，粘贴发我。`, 10000),
          () => new Notice(`复制失败，内容：\n${text.slice(0, 400)}`, 20000),
        );
      },
    });

    this.addCommand({
      id: "transcribe-active-media",
      name: "整理当前音视频文件",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !isMedia(file)) return false;
        if (!checking) void this.run(file);
        return true;
      },
    });

    this.addCommand({
      id: "transcribe-pick-media",
      name: "从 Vault 里选一个音视频整理",
      callback: () => {
        new MediaPickerModal(this.app, this).open();
      },
    });

    // 文件列表右键：比先打开文件再敲命令顺手
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || !isMedia(file)) return;
        menu.addItem((item) =>
          item
            .setTitle("爱谛听：整理成笔记")
            .setIcon("audio-file")
            .onClick(() => void this.run(file)),
        );
      }),
    );
  }

  /**
   * 从剪贴板取 API Key 并保存。
   *
   * 为什么要这个：用户在工作台复制 Key 之后，还得切回 Obsidian、翻进设置页、
   * 把光标点进输入框、粘贴——这几步里每一步都会掉一批人。
   * 这里把「复制 → 回来点一下」压成两步，第一次使用就能跑通。
   */
  async applyApiKeyFromClipboard(): Promise<boolean> {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      new Notice("读不到剪贴板（系统没给权限）。请在设置里手动粘贴 Key。", 10000);
      return false;
    }

    const key = text.trim();
    // 只认明显是 Key 的内容。否则用户剪贴板里是一段正文时会把正文存成 Key，
    // 之后上传报 401，看起来像「Key 失效」，实际是从来没配对。
    if (!/^sk-[A-Za-z0-9_-]{8,}$/.test(key)) {
      const preview = key ? `${key.slice(0, 24)}${key.length > 24 ? "…" : ""}` : "（空）";
      new Notice(
        `剪贴板里不是 API Key。先在工作台点「创建 Key」并复制，再回来运行这条命令。\n读到的是：${preview}`,
        12000,
      );
      return false;
    }

    this.settings.apiKey = key;
    await this.saveSettings();
    new Notice("API Key 已保存，现在可以整理音视频了。", 6000);
    return true;
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<AiditingSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  listMedia(): TFile[] {
    return this.app.vault.getFiles().filter(isMedia);
  }

  /** 主流程：读文件 → 上传 → 等待 → 生成 → 确认路径 → 写新文件 */
  async run(file: TFile): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice("仅支持桌面端 Obsidian；手机端不加载这个插件。");
      return;
    }
    if (!this.settings.apiKey) {
      // 已上架社区市场，不会再有「我们发 Key 给你」这回事，文案必须能自解释：
      // 说清去哪里拿、免费额度多少，否则市场用户装完只会看到一句无从下手的提示。
      new Notice(
        "还没填 API Key。设置 → 第三方插件 → AiDiTing → 选项，填上即可；没有 Key 可去 aiditing.cn/workspace 创建（免费额度每月 30 分钟）。",
        12000,
      );
      return;
    }

    const size = file.stat.size;
    if (size > MAX_FILE_BYTES) {
      new Notice(
        `这个文件 ${(size / 1024 / 1024).toFixed(0)}MB，超过 200MB 上限。先裁剪或转码后再试。`,
        10000,
      );
      return;
    }

    const api = new AiditingApi(this.settings.apiBase, this.settings.apiKey, obsidianTransport);
    const progress = new Notice(`正在读取 ${file.name}…`, 0);

    try {
      const data = await this.app.vault.readBinary(file);

      progress.setMessage(`正在上传 ${file.name}（${(size / 1024 / 1024).toFixed(1)}MB）…`);
      const taskId = await api.upload(file.name, mimeOf(file.name), data);

      progress.setMessage("已提交，等待整理。可以先去干别的，好了会提示。");
      const task = await api.waitForTask(taskId, (t) => {
        progress.setMessage(`整理中… ${describeTask(t)}`);
      });

      if (task.status !== "completed") {
        progress.hide();
        new Notice(`整理失败：${task.errorMessage ?? task.status}。额度不受影响。`, 12000);
        return;
      }

      const note = buildNote(task, {
        sourceName: file.name,
        title: safeFileName(baseName(file.name)),
        taskId,
        apiBase: this.settings.apiBase,
        sectionMinutes: this.settings.sectionMinutes,
        embedSource: this.settings.embedSource,
      });

      const proposed = this.buildPath(file);
      const target = this.settings.confirmBeforeWrite ? await this.confirmPath(proposed) : proposed;
      if (!target) {
        progress.hide();
        new Notice("已取消，没有写入任何文件。");
        return;
      }

      const folder = normalizePath(target.split("/").slice(0, -1).join("/") || "/");
      await this.ensureFolder(folder);

      const created = await this.app.vault.create(target, note);
      progress.hide();
      new Notice(`已写入 ${target}`);

      if (this.settings.openAfterCreate) {
        await this.app.workspace.getLeaf(true).openFile(created);
      }
    } catch (err) {
      progress.hide();
      new Notice(err instanceof Error ? err.message : String(err), 12000);
    }
  }

  /** 目标路径：目标目录 + 标题 + .md；重名时加序号，绝不覆盖已有笔记 */
  private buildPath(file: TFile): string {
    const folder = normalizePath(this.settings.targetFolder || "00-Inbox");
    const base = safeFileName(baseName(file.name));
    let candidate = normalizePath(`${folder}/${base}.md`);

    let i = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${folder}/${base}-${i}.md`);
      i += 1;
    }
    return candidate;
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder || folder === "/") return;
    let current = "";
    for (const part of folder.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private confirmPath(proposed: string): Promise<string | null> {
    return new Promise((resolve) => {
      new PathConfirmModal(this.app, proposed, resolve).open();
    });
  }
}

function describeTask(task: TaskView): string {
  if (typeof task.progress === "number" && task.progress > 0) return `${Math.round(task.progress)}%`;
  if (task.status === "queued") return "排队中";
  return "处理中";
}

class MediaPickerModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private plugin: AiditingPlugin,
  ) {
    super(app);
    this.setPlaceholder("选一个音频或视频文件…");
  }

  getItems(): TFile[] {
    return this.plugin.listMedia();
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    void this.plugin.run(item);
  }
}

/**
 * 写入前的路径确认。
 * 文案里承诺过「写入前显示目标路径，可改目录」——所以这里不只是确认，路径本身可编辑。
 */
class PathConfirmModal extends Modal {
  private value: string;
  private submitted = false;

  constructor(
    app: App,
    initial: string,
    private readonly onDone: (path: string | null) => void,
  ) {
    super(app);
    this.value = initial;
  }

  onOpen(): void {
    this.titleEl.setText("确认落库路径");
    this.contentEl.createEl("p", {
      text: "只新增这一篇笔记，不会改动、移动你已有的笔记。",
      cls: "setting-item-description",
    });

    new Setting(this.contentEl).setName("文件路径").addText((text) => {
      text.setValue(this.value).onChange((v) => {
        this.value = v.trim();
      });
      text.inputEl.addClass("aiditing-path-input");
    });

    new Setting(this.contentEl)
      .addButton((btn) =>
        btn.setButtonText("写入").setCta().onClick(() => {
          this.submitted = Boolean(this.value);
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.submitted = false;
          this.close();
        }),
      );
  }

  onClose(): void {
    const result = this.submitted && this.value ? normalizePath(this.value) : null;
    this.contentEl.empty();
    this.onDone(result);
  }
}

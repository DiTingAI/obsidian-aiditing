import {
  type App,
  FuzzySuggestModal,
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
import { AiditingSettingTab, DEFAULT_SETTINGS, type AiditingSettings } from "./settings";

function isMedia(file: TFile): boolean {
  return isMediaName(file.name);
}

export default class AiditingPlugin extends Plugin {
  settings!: AiditingSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new AiditingSettingTab(this.app, this));

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
      new Notice("内测期只验证了桌面端 Obsidian，手机端暂不支持。");
      return;
    }
    if (!this.settings.apiKey) {
      new Notice("还没填内测 Key。打开 设置 → 第三方插件 → 爱谛听，粘贴我们发给你的 Key。", 10000);
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
      text.inputEl.style.width = "100%";
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

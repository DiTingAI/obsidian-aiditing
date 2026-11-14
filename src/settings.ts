import { App, PluginSettingTab, Setting } from "obsidian";
import type AiditingPlugin from "./main";

/** 工作台：用户在这里登录并创建 API Key，与网页端共用同一个 Key */
const CONSOLE_URL = "https://aiditing.cn/workspace";

export interface AiditingSettings {
  /** 开放 API 地址，改这里可以指向自建/测试环境 */
  apiBase: string;
  /** API Key（diting-api 的 sk-diting-xxx），在 aiditing.cn/workspace 创建。为空时插件不允许执行任务 */
  apiKey: string;
  /** 笔记落库目录，默认 00-Inbox */
  targetFolder: string;
  /** 每多少分钟切一个章节；0 表示不切章节，整篇成一节 */
  sectionMinutes: number;
  /** 写入前弹窗确认目标路径（默认开：宁可多点一次，也不要写错地方） */
  confirmBeforeWrite: boolean;
  /** 生成后自动打开笔记 */
  openAfterCreate: boolean;
}

export const DEFAULT_SETTINGS: AiditingSettings = {
  apiBase: "https://api.diting.cc",
  apiKey: "",
  targetFolder: "00-Inbox",
  sectionMinutes: 10,
  confirmBeforeWrite: true,
  openAfterCreate: true,
};

export class AiditingSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: AiditingPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Key 的名称与获取路径是上架前的硬性前提：
    // 从前写「内测 Key，单独发放」，市场用户装完拿不到，只能给差评。
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("在爱谛听工作台登录后创建（免费额度每月 30 分钟）。没有 Key 时插件不会上传任何文件。")
      .addText((text) =>
        text
          .setPlaceholder("sk-diting-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("还没有 Key？")
      .setDesc("打开工作台创建，创建后复制回来粘贴到上面。")
      .addButton((button) =>
        button
          .setButtonText("去创建")
          .setCta()
          .onClick(() => {
            window.open(CONSOLE_URL, "_blank");
          }),
      );

    new Setting(containerEl)
      .setName("API 地址")
      .setDesc("默认 https://api.diting.cc。除非我们另行通知，不要改这里。")
      .addText((text) =>
        text
          .setPlaceholder("https://api.diting.cc")
          .setValue(this.plugin.settings.apiBase)
          .onChange(async (value) => {
            this.plugin.settings.apiBase = value.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("笔记落库目录")
      .setDesc("生成的 Markdown 写到这里。目录不存在会自动创建；只新增文件，不改已有笔记。")
      .addText((text) =>
        text
          .setPlaceholder("00-Inbox")
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = value.trim().replace(/^\/+|\/+$/g, "");
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("章节切分间隔（分钟）")
      .setDesc("按时间戳每 N 分钟切一个小节，标题取该段第一句。填 0 则不切章节。")
      .addText((text) =>
        text
          .setPlaceholder("10")
          .setValue(String(this.plugin.settings.sectionMinutes))
          .onChange(async (value) => {
            const n = Number(value);
            this.plugin.settings.sectionMinutes = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("写入前确认路径")
      .setDesc("开启后，落盘前会显示最终路径，点确认才写。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.confirmBeforeWrite).onChange(async (value) => {
          this.plugin.settings.confirmBeforeWrite = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("生成后打开笔记")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openAfterCreate).onChange(async (value) => {
          this.plugin.settings.openAfterCreate = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("p", {
      text: "说明：整理结果是一份可改的初稿，不是终稿；实际耗时取决于文件时长、网络与当前队列，插件不显示预计完成时间。",
      cls: "setting-item-description",
    });
  }
}

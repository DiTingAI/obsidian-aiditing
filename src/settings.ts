import { App, PluginSettingTab } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type AiditingPlugin from "./main";
import { normalizeSettingValue, validateSetting, type SettingKey } from "./settings-values";

/** 工作台：用户在这里登录并创建 API Key，与网页端共用同一个 Key */
// 对外链接必须带归因参数（项目铁律第八节）。obsidian 已于 2026-11-15 登记进白名单，
// 用来把「插件带来的注册」和直接访问分开统计。
export const CONSOLE_URL = "https://aiditing.cn/workspace?from=obsidian&c=20261115-obsidian-plugin";

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
  /**
   * 在笔记顶部嵌入原媒体的原生播放器（默认开）。
   *
   * 逐句时间点只是位置标注，Obsidian 不会把 `00:12` 变成可点击跳转；
   * 同一页放一个播放器，用户才能「看一句、拖一下、听一句」地把稿子核对完。
   */
  embedSource: boolean;
}

export const DEFAULT_SETTINGS: AiditingSettings = {
  apiBase: "https://api.diting.cc",
  apiKey: "",
  targetFolder: "00-Inbox",
  sectionMinutes: 10,
  confirmBeforeWrite: true,
  openAfterCreate: true,
  embedSource: true,
};

export class AiditingSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: AiditingPlugin,
  ) {
    super(app, plugin);
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
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "API Key",
        desc: "在爱谛听工作台登录后创建（免费额度每月 30 分钟）。没有 Key 时插件不会上传任何文件。",
        control: { type: "text", key: "apiKey", placeholder: "sk-diting-..." },
      },
      {
        name: "还没有 Key？两步搞定",
        desc: "① 点「去创建」，在工作台登录后创建 Key 并复制 → ② 回来点「从剪贴板读取」，Key 会自动填到上面。",
        // 声明式渲染给的是一行空 Setting，正好把两个按钮挂上去；
        // 不用 action 类型：那会让整行变成可点击区域，用户点说明文字也会跳走。
        render: (setting) => {
          setting.addButton((button) =>
            button.setButtonText("去创建").setCta().onClick(() => {
              window.open(CONSOLE_URL, "_blank");
            }),
          );
          setting.addButton((button) =>
            button.setButtonText("从剪贴板读取").onClick(async () => {
              // update() 重读 getControlValue，输入框才会显示刚粘进来的 Key
              if (await this.plugin.applyApiKeyFromClipboard()) this.update();
            }),
          );
        },
      },
      {
        name: "API 地址",
        desc: "默认 https://api.diting.cc。除非我们另行通知，不要改这里。",
        control: {
          type: "text",
          key: "apiBase",
          placeholder: "https://api.diting.cc",
          // 填错会让所有请求打到不存在的地址，用户看到的只是「请求失败」——这里挡一下比事后排查便宜
          validate: (value) => validateSetting("apiBase", value),
        },
      },
      {
        name: "笔记落库目录",
        desc: "生成的 Markdown 写到这里。目录不存在会自动创建；只新增文件，不改已有笔记。",
        control: { type: "text", key: "targetFolder", placeholder: "00-Inbox" },
      },
      {
        name: "章节切分间隔（分钟）",
        desc: "按时间戳每 N 分钟切一个小节，标题取该段第一句。填 0 则不切章节。",
        control: { type: "number", key: "sectionMinutes", placeholder: "10", min: 0 },
      },
      {
        name: "写入前确认路径",
        desc: "仅本地上传生效：落盘前显示最终路径，点确认才写。链接转写不弹窗（可能一次写多篇），默认写入 00-Inbox，重名自动加序号，不会覆盖已有笔记。",
        control: { type: "toggle", key: "confirmBeforeWrite" },
      },
      {
        name: "生成后打开笔记",
        control: { type: "toggle", key: "openAfterCreate" },
      },
      {
        name: "笔记顶部嵌入原媒体",
        desc: "把原音视频嵌进笔记，方便对照逐句时间点拖动时间轴回听。关掉则只保留 frontmatter 里的 source 溯源信息。",
        control: { type: "toggle", key: "embedSource" },
      },
      {
        name: "关于耗时与初稿",
        desc: "整理结果是一份可改的初稿，不是终稿；实际耗时取决于文件时长、网络与当前队列，插件不显示预计完成时间。",
      },
    ];
  }

  /** 声明式控件读值：映射到插件自己的设置对象（不走 Obsidian 的 vault config） */
  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  /** 声明式控件写值：清洗 → 落内存 → 落盘 */
  setControlValue(key: string, value: unknown): void | Promise<void> {
    const store = this.plugin.settings as unknown as Record<string, unknown>;
    // 拼错的 key 不能静默写进去：那只会给设置对象留一堆没人读的垃圾字段
    if (!(key in store)) return;
    store[key] = normalizeSettingValue(key as SettingKey, value);
    return this.plugin.saveSettings();
  }

}

/**
 * 设置项的取值清洗与校验（纯函数，不 import obsidian）。
 *
 * 为什么单独一个文件：
 * 1. 声明式设置（Obsidian 1.13+）和 display()（旧版）是两套渲染，但**必须洗成同一个值**——
 *    清洗逻辑原先散在各自的 onChange 里，加一条设置就复制一遍，很快就分叉；
 * 2. settings.ts 依赖 obsidian 运行时，在 Node 单测里 import 不了，抽出来才能测。
 */

export type SettingKey =
  | "apiBase"
  | "apiKey"
  | "targetFolder"
  | "sectionMinutes"
  | "confirmBeforeWrite"
  | "openAfterCreate"
  | "embedSource";

/** 把控件给的原始值收敛成能直接落盘的值 */
export function normalizeSettingValue(key: SettingKey, value: unknown): string | number | boolean {
  switch (key) {
    case "apiBase":
      // 结尾多一个 / 会让 `${base}/v1/...` 变成 `//v1/...`，部分网关直接 404
      return String(value ?? "").trim().replace(/\/+$/, "");
    case "apiKey":
      return String(value ?? "").trim();
    case "targetFolder":
      // 落库路径前面带 / 会被 normalizePath 当成绝对路径
      return String(value ?? "").trim().replace(/^\/+|\/+$/g, "");
    case "sectionMinutes": {
      // Number("") === 0，空输入必须当「没填」而不是「填了 0」：
      // 0 表示不切章节，跟默认 10 分钟是完全相反的两种行为。
      const raw = String(value ?? "").trim();
      if (!raw) return 10;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
    }
    default:
      // 三个开关：只认布尔。字符串 "false" 在 Boolean() 下是 true，
      // 但开关控件从不产生字符串，出现字符串就说明调用方传错了，按 false 处理更安全。
      return value === true || value === "true";
  }
}

/** 校验控件值；返回非空字符串则该次修改被拒绝，并作为行内错误展示 */
export function validateSetting(key: SettingKey, value: unknown): string | void {
  if (key === "apiBase") {
    const text = String(value ?? "").trim();
    if (!text) return "API 地址不能为空。默认 https://api.diting.cc";
    if (!/^https?:\/\//i.test(text)) {
      return "要填 http:// 或 https:// 开头的地址，例如 https://api.diting.cc";
    }
  }
  if (key === "sectionMinutes") {
    const raw = String(value ?? "").trim();
    if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return "填 0 或更大的整数（0 = 不切章节）";
    }
  }
  return;
}

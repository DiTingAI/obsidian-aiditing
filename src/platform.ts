/**
 * 平台链接识别，以及「时间点怎么呈现」。
 *
 * 为什么单独一个文件：
 *
 * 1. **识别错平台 = 请求打到错误端点**。后端 bilibili / douyin / xhs 是三个独立端点，
 *    参数结构还不一样（B站是多P数组，抖音/小红书是单条）。识别错了，用户看到的是
 *    「参数错误」，完全看不出根因。
 *
 * 2. **时间点形态决定「点一下能不能回原音」**。本地文件可以 `![[x.mov]]` 嵌入，
 *    点时间点改的是原生播放器的 currentTime；但 B站/抖音/小红书的视频不在 vault 里，
 *    没有播放器可跳。B 站是唯一支持 `?t=秒数` 的，所以只有它能做成「点了跳原音」；
 *    抖音/小红书没有这个能力，写成链接就是骗人，只能做位置标注。
 */

export type Platform = "bilibili" | "douyin" | "xhs";

export interface PlatformMatch {
  platform: Platform;
  /** 规范化后的链接，直接交给后端 check / submit */
  url: string;
  /** B站 BV 号；只有它能拼出带 ?t= 的时间点链接 */
  bvid?: string;
}

/** 生成时间点时所需要的最小信息 */
export interface RemoteVideo {
  platform: Platform;
  bvid?: string;
  /** B站分P序号，从 1 开始；单P 或非 B站留空 */
  page?: number;
}

/** BV 号：BV + 10 位字母数字 */
const BVID_RE = /BV[0-9A-Za-z]{10}/;
/** 从用户粘贴的内容里抠出第一个 http(s) 链接（App 分享出来通常是一整段话） */
const URL_RE = /https?:\/\/[^\s，,、。；;"'）)]+/;

const HOSTS: Array<{ platform: Platform; hosts: string[] }> = [
  { platform: "bilibili", hosts: ["bilibili.com", "b23.tv"] },
  { platform: "douyin", hosts: ["douyin.com", "iesdouyin.com"] },
  { platform: "xhs", hosts: ["xiaohongshu.com", "xhslink.com"] },
];

function hostPlatform(hostname: string): Platform | null {
  const host = hostname.toLowerCase();
  for (const entry of HOSTS) {
    if (entry.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return entry.platform;
  }
  return null;
}

/**
 * 认链接属于哪个平台。认不出就返回 null，**不猜**——
 * 猜错的代价是用户等了半天拿到一个「参数错误」，比直接说「不支持的链接」糟得多。
 */
export function detectPlatform(input: string): PlatformMatch | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // 裸 BV 号：后端支持自动补全成完整链接，这里也补全，方便后面拼 ?t=
  const bareBv = raw.match(new RegExp(`^${BVID_RE.source}$`));
  if (bareBv) {
    return {
      platform: "bilibili",
      url: `https://www.bilibili.com/video/${bareBv[0]}`,
      bvid: bareBv[0],
    };
  }

  const urlText = raw.match(URL_RE)?.[0];
  if (!urlText) return null;

  let parsed: URL;
  try {
    parsed = new URL(urlText);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const platform = hostPlatform(parsed.hostname);
  if (!platform) return null;

  // 短链（b23.tv / xhslink.com）里没有 BV 号，交给后端解析，这里不编造
  const bvid = platform === "bilibili" ? urlText.match(BVID_RE)?.[0] : undefined;

  return { platform, url: urlText, bvid };
}

/**
 * 把时间点渲染成 markdown。
 *
 * - B站且有 BV 号 → `[01:30](https://www.bilibili.com/video/BVxxx?t=90)`，点了跳网页对应秒
 * - 其余情况 → `` `01:30` ``（位置标注，不可点）
 *
 * 绝不为了「看起来能点」而给一个跳不到正确位置的链接。
 */
export function timestampMarkdown(video: RemoteVideo, ts: string, seconds: number): string {
  if (video.platform === "bilibili" && video.bvid) {
    const at = Math.max(0, Math.floor(seconds));
    const query = video.page && video.page > 0 ? `?p=${video.page}&t=${at}` : `?t=${at}`;
    return `[${ts}](https://www.bilibili.com/video/${video.bvid}${query})`;
  }
  return `\`${ts}\``;
}

/** 平台的中文名，用于提示与笔记 frontmatter */
export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "bilibili":
      return "B站";
    case "douyin":
      return "抖音";
    case "xhs":
      return "小红书";
  }
}

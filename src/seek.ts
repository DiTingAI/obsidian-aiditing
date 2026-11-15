/**
 * 点时间点跳到原音对应位置。
 *
 * 为什么不用 `[[file#t=90]]`：2026-11-15 实测（Obsidian 1.12.7，真实 vault）
 * 六种写法全部不能跳转——Obsidian 没有原生的媒体时间戳链接解析，
 * `obsidian.asar` 里 `#t=` 只有一处，且是内部探测视频尺寸用的。
 * 详见 docs/时间戳跳转调研.md。
 *
 * 所以跳转由插件自己干：笔记里 `![[原媒体]]` 嵌入后，Obsidian 原生播放器是页面上的
 * 一个真实 <video>/<audio> 元素；我们给行内代码时间点挂点击事件，直接改它的 currentTime。
 * 好处是不用自建播放器（原生播放器能播 .mov，这是实测过的），也不依赖第三方插件。
 *
 * 已知边界：只在**阅读模式**生效。Live Preview 下时间点不是 DOM 元素，是 CM6 的文本 token，
 * 挂不上事件——这一点必须写进说明，不能让用户以为是坏的。
 */

const TS_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * 提示通道由调用方注入，而不是这里直接 `import { Notice } from "obsidian"`。
 * 原因：本文件要能被 node 单测直接 import，而单测环境里没有 obsidian 模块，
 * 一旦静态依赖它，整个测试文件都跑不起来（实测过一次）。
 */
let notifyUser: (message: string, ms?: number) => void = () => {};

export function setSeekNotifier(fn: (message: string, ms?: number) => void): void {
  notifyUser = fn;
}

/** 在给定范围内找原生播放器（嵌入的音视频在阅读模式与 Live Preview 里都是真实 DOM 元素） */
export function findPlayer(scope: ParentNode): HTMLMediaElement | null {
  return scope.querySelector<HTMLMediaElement>("video, audio");
}

/** 收集范围内所有播放器候选 */
export function findPlayers(scope: ParentNode): HTMLMediaElement[] {
  return Array.from(scope.querySelectorAll<HTMLMediaElement>("video, audio"));
}

/**
 * 从多个候选里挑出「用户正在看的那一个」。
 *
 * 为什么需要挑：2026-11-15 实测，一篇只有**一处** `![[x.mov]]` 嵌入的笔记，
 * 页面上却有 **2 个 <video>**（同一个 src，一个在播、一个停在 0 秒）。
 * 之前用 querySelector 盲取第一个，跳的是用户看不见的那个——
 * 声音到位了、画面不动，看着像 seek 失败，其实一直跳错了元素。
 *
 * 判据按可靠性排序：可见 > 正在播 > 已经播过 > 离被点的时间点近。
 */
export function pickPlayer(root: HTMLElement, anchor?: HTMLElement): HTMLMediaElement | null {
  const scope = root.closest(".workspace-leaf") ?? root;
  const candidates = Array.from(new Set([...findPlayers(root), ...findPlayers(scope)]));
  if (candidates.length <= 1) return candidates[0] ?? null;

  const anchorRect = anchor ? anchor.getBoundingClientRect() : null;
  let best: HTMLMediaElement | null = null;
  let bestScore = -Infinity;

  for (const m of candidates) {
    const r = m.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    let score = 0;
    if (visible) score += 100;
    if (!m.paused) score += 50;
    if (m.currentTime > 0) score += 20;
    if (visible && anchorRect) {
      // 时间点列表通常紧贴播放器下方，垂直距离最近的那个最可能是同一块嵌入
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

/**
 * 把播放器拨到第 seconds 秒并开始播。
 *
 * 两个坑，都是实测踩出来的：
 *
 * 1. 媒体还没加载元数据时（readyState === 0）写 currentTime 会被忽略甚至抛错，
 *    表现就是「点了没反应」。所以等 loadedmetadata 再拨，并留一条 1.5 秒兜底路径。
 *
 * 2. 就算元数据好了，`currentTime = x` 紧接着 `play()` 一起下发，
 *    **音频轨道会跳到位，但 video 画面停在原帧不刷新**。
 *    2026-11-15 在真实 vault 里点 `00:20` 复现：声音是第 20 秒的，画面还是第 0 秒的。
 *    排除了编码嫌疑——ffprobe 核过是 H.264 High / 30fps / 关键帧间隔 1 秒，很正常。
 *    纯粹是 seek 与 play 同时下发时渲染层没跟上。
 *
 * 所以顺序必须是：pause → 写 currentTime → 等 seeked → 再等一帧 → play。
 * 少任何一步画面都可能不跟。
 */
export function seekTo(player: HTMLMediaElement, seconds: number): boolean {
  if (!Number.isFinite(seconds) || seconds < 0) return false;

  let resumed = false;
  const startPlayback = () => {
    if (resumed) return;
    resumed = true;
    try {
      void player.play();
    } catch {
      /* 位置已经定位好了；播不播得起来是另一回事，不算跳转失败 */
    }
  };

  const apply = () => {
    try {
      // 先暂停再定位：播放中直接 seek，画面更容易留在原帧
      player.pause();
      player.currentTime = seconds;
    } catch {
      return;
    }

    // seeked 表示已经解码到新位置，再等一帧让渲染层把画面刷上去
    const onSeeked = () => {
      player.removeEventListener("seeked", onSeeked);
      requestAnimationFrame(startPlayback);
    };
    player.addEventListener("seeked", onSeeked);

    // 兜底：目标位置与当前位置相同（不会触发 seeked），或事件迟迟不来
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

/** `00:12` → 12，`1:02:30` → 3750；不是纯时间戳（如「第 1 段」「00:12 - 00:15」）返回 null */
export function parseTimestamp(text: string): number | null {
  const m = TS_RE.exec(text.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] === undefined ? null : Number(m[3]);
  return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
}

/**
 * 给容器里所有形如 `00:12` 的行内代码挂上「跳到该秒」的点击行为。
 *
 * @returns 实际挂上的时间点个数（0 表示容器里没有播放器，或没有时间点）
 */
export function attachSeekHandlers(root: HTMLElement): number {
  const codes = Array.from(root.querySelectorAll("code"));
  if (codes.length === 0) return 0;

  // 播放器是懒查的：post processor 逐段触发，嵌入块可能比正文段晚渲染，
  // 挂事件时查不到不代表点击时也查不到。
  // 而且同一段嵌入可能有多份渲染，必须按「离这个时间点最近」去挑，不能盲取第一个。
  const playerNow = (anchor?: HTMLElement) => pickPlayer(root, anchor);

  let wired = 0;
  for (const code of codes) {
    const el = code as HTMLElement;
    if (el.dataset.aiditingSeek === "1") continue;

    const seconds = parseTimestamp(el.textContent ?? "");
    if (seconds === null) continue;

    el.dataset.aiditingSeek = "1";
    const label = (el.textContent ?? "").trim();

    // 只有容器里真的存在播放器，才把它做成可点的样子。
    // 没有播放器却画出下划线，就是在承诺一个点了没反应的东西。
    const markClickable = (hasPlayer: boolean) => {
      if (!hasPlayer) return;
      el.classList.add("aiditing-ts");
      el.setAttribute("role", "button");
      el.setAttribute("title", `点击跳到 ${label}`);
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
        // 没播放器就点不动，这是真实的失败原因，必须让人看见，而不是静默
        notifyUser(`这篇笔记里没有找到原媒体播放器，时间点 ${label} 无法跳转。`, 8000);
        return;
      }
      // 顺序不能反：先瞬时滚到可见，再 seek。
      // smooth 滚动期间 Chromium 会把 video 层按静态纹理合成，和 seek 抢渲染，
      // 画面就不刷新了（和上面 seekTo 里那条是同源问题）。
      player.scrollIntoView({ block: "nearest" });
      seekTo(player, seconds);
    });

    wired += 1;
  }
  return wired;
}

/** 诊断用：数一下当前视图里的时间点与播放器，回答「为什么点了没反应」 */
export function inspectScope(root: ParentNode): {
  timestamps: number;
  player: boolean;
  mediaCount: number;
  wired: number;
} {
  const codes = Array.from(root.querySelectorAll("code"));
  const ts = codes
    .map((c) => parseTimestamp(c.textContent ?? ""))
    .filter((n): n is number => n !== null);
  // 与 attachSeekHandlers 用同一套查找范围，否则诊断说「没播放器」而点击却能跳，只会误导排查
  const scope =
    root instanceof Element ? root.closest(".workspace-leaf") ?? root : root;
  const mediaCount = findPlayers(scope).length;
  return {
    timestamps: ts.length,
    player: mediaCount > 0,
    mediaCount,
    wired: codes.filter((c) => (c as HTMLElement).dataset.aiditingSeek === "1").length,
  };
}

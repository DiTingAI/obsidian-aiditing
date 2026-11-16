/**
 * Node 垫片：给插件代码一个最小 window。
 *
 * 为什么需要它：src/timer.ts 只用 window.setTimeout —— 这是 Obsidian 目录扫描的硬要求
 * （弹窗场景下裸 setTimeout 会落到主窗口，globalThis 兜底也被禁）。
 * 但单测和冒烟脚本跑在 Node 里，没有 window，waitForTask 会直接 TypeError。
 *
 * 垫片只放在 tests/ 与 scripts/，**不进 src**：生产代码不该知道自己跑在 Node 上。
 */
export function installWindowTimer(): void {
  const holder = globalThis as unknown as {
    window?: { setTimeout: (fn: () => void, ms: number) => number };
  };
  if (holder.window?.setTimeout) return;

  holder.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  };
}

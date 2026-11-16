/**
 * 延时器：插件运行时唯一允许拿计时器的地方。
 *
 * 为什么单独一个文件，而不是散在 api.ts 里：
 * Obsidian 的目录扫描对计时器有两条硬规矩——
 *   1. 不许用裸 setTimeout：插件可能在弹窗（popout window）里跑，
 *      裸调用会落到主窗口的计时器上；
 *   2. 不许用 globalThis 兜底 Node：那是「为测试写的运行时代码」。
 * 两条合在一起，只剩一个干净解法：src 里只写 `window.setTimeout`，
 * 由测试/冒烟脚本在 Node 侧装一个最小的 window 垫片（见 tests/node-window.ts）。
 *
 * 也就是说：这个文件假定 window 一定存在 —— 在 Obsidian 里它确实存在。
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), ms);
  });
}

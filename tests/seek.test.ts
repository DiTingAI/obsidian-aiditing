import assert from "node:assert/strict";
import test from "node:test";
import { parseTimestamp, pickPlayer } from "../src/seek";

/**
 * 只测纯解析。
 * DOM 挂事件那段依赖 Obsidian 真实渲染环境，单测里不假装能跑——
 * 真实性由「在 vault 里点一下是否跳到对应秒」来保证。
 */

test("时间点解析：mm:ss 与 hh:mm:ss 都认", () => {
  assert.equal(parseTimestamp("00:12"), 12);
  assert.equal(parseTimestamp("12:34"), 754);
  assert.equal(parseTimestamp("1:02:30"), 3750);
  assert.equal(parseTimestamp("0:00"), 0);
});

test("时间点解析：两侧空白不影响", () => {
  assert.equal(parseTimestamp("  03:07 "), 187);
});

test("时间点解析：不是纯时间戳的一律拒绝", () => {
  // 这些都不是「某一秒」，挂上点击会跳到错误的坑位，宁可不认
  for (const bad of [
    "第 1 段",
    "00:12 - 00:15",
    "[00:12]",
    "00:12.340",
    "1:2",
    "abc",
    "",
    "12:345",
  ]) {
    assert.equal(parseTimestamp(bad), null, `${bad} 不应被认成时间戳`);
  }
});

/**
 * pickPlayer 的选择逻辑。
 *
 * 背景（2026-11-15 实测）：一篇只有一处 `![[x.mov]]` 嵌入的笔记，页面上却渲染出
 * 2 个 <video>。盲取第一个会跳到用户看不见的那个——声音跳了、画面不动。
 * 这几条测试就是锁住「挑对元素」的判据。
 */
function fakeMedia(opts: { visible?: boolean; paused?: boolean; currentTime?: number; top?: number }): HTMLMediaElement {
  const width = opts.visible === false ? 0 : 640;
  const height = opts.visible === false ? 0 : 360;
  const top = opts.top ?? 0;
  return {
    paused: opts.paused ?? true,
    currentTime: opts.currentTime ?? 0,
    getBoundingClientRect: () => ({
      width,
      height,
      top,
      bottom: top + height,
      left: 0,
      right: width,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLMediaElement;
}

function fakeRoot(medias: HTMLMediaElement[]): HTMLElement {
  return {
    querySelectorAll: () => medias,
    closest: () => null,
  } as unknown as HTMLElement;
}

function fakeAnchor(top: number, height = 20): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      width: 80,
      height,
      top,
      bottom: top + height,
      left: 0,
      right: 80,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
}

test("播放器挑选：优先可见的那个，跳过隐藏元素", () => {
  const hidden = fakeMedia({ visible: false, paused: false });
  const shown = fakeMedia({ visible: true, paused: true });
  assert.equal(pickPlayer(fakeRoot([hidden, shown])), shown);
});

test("播放器挑选：都可见时优先正在播的", () => {
  const pausedOne = fakeMedia({ visible: true, paused: true });
  const playing = fakeMedia({ visible: true, paused: false });
  assert.equal(pickPlayer(fakeRoot([pausedOne, playing])), playing);
});

test("播放器挑选：都暂停时挑离时间点最近的", () => {
  const far = fakeMedia({ visible: true, top: 0 });
  const near = fakeMedia({ visible: true, top: 900 });
  // 时间点在页面下方（y≈1000），上方那个 far 离得远
  assert.equal(pickPlayer(fakeRoot([far, near]), fakeAnchor(1000)), near);
});

test("播放器挑选：只有一个候选就直接用它", () => {
  const only = fakeMedia({ visible: false });
  assert.equal(pickPlayer(fakeRoot([only])), only);
});

test("播放器挑选：一个都没有时返回 null", () => {
  assert.equal(pickPlayer(fakeRoot([])), null);
});

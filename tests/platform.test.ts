import assert from "node:assert/strict";
import test from "node:test";
import { detectPlatform, timestampMarkdown, type RemoteVideo } from "../src/platform";

/**
 * 平台识别与时间点呈现。
 *
 * 为什么这两件事要单独测：
 * 1. 识别错平台 → 请求打到错误的端点，用户看到的是「参数错误」，看不出是识别错了；
 * 2. 时间点形态决定「点一下能不能回原音」——B 站能带 ?t= 跳到对应秒，
 *    抖音/小红书没有这个能力，写成链接就是骗人。
 */

test("平台识别：B站各种链接形式都认，并取出 BV 号", () => {
  const cases = [
    "https://www.bilibili.com/video/BV1xx411c7mD",
    "https://m.bilibili.com/video/BV1xx411c7mD?p=2",
    "https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.999",
    "  https://www.bilibili.com/video/BV1xx411c7mD  ",
  ];
  for (const url of cases) {
    const m = detectPlatform(url);
    assert.ok(m, `${url} 应被识别为 B站`);
    assert.equal(m.platform, "bilibili", url);
    assert.equal(m.bvid, "BV1xx411c7mD", url);
  }
});

test("平台识别：裸 BV 号也认（后端支持自动补全链接）", () => {
  const m = detectPlatform("BV1xx411c7mD");
  assert.ok(m);
  assert.equal(m.platform, "bilibili");
  assert.equal(m.bvid, "BV1xx411c7mD");
});

test("平台识别：B站短链认得平台，但取不到 BV 号", () => {
  const m = detectPlatform("https://b23.tv/aBcDeFg");
  assert.ok(m);
  assert.equal(m.platform, "bilibili");
  assert.equal(m.bvid, undefined, "短链里没有 BV 号，不能瞎编");
});

test("平台识别：抖音链接与分享文案都能认出", () => {
  assert.equal(detectPlatform("https://v.douyin.com/iRAbCdEf/")?.platform, "douyin");
  // 用户从 App 里复制的通常是整段文案，链接夹在中间
  const shareText = "7.92 复制打开抖音，看看【某某的作品】这个方法太好用了 https://v.douyin.com/iRAbCdEf/ 复制此链接";
  assert.equal(detectPlatform(shareText)?.platform, "douyin");
});

test("平台识别：小红书链接与分享文案都能认出", () => {
  assert.equal(detectPlatform("https://www.xiaohongshu.com/explore/65a1b2c3")?.platform, "xhs");
  assert.equal(detectPlatform("https://xhslink.com/aBcDeF")?.platform, "xhs");
  const shareText = "67 小红书 发现一篇好笔记 http://xhslink.com/aBcDeF，复制本条信息";
  assert.equal(detectPlatform(shareText)?.platform, "xhs");
});

test("平台识别：不是这三家的链接一律返回 null，不猜", () => {
  for (const bad of [
    "",
    "   ",
    "随便一段话",
    "https://www.youtube.com/watch?v=abc",
    "https://example.com/video/BV1xx411c7mD",
    "ftp://www.bilibili.com/video/BV1xx411c7mD",
  ]) {
    assert.equal(detectPlatform(bad), null, `${bad} 不该被认成可处理的链接`);
  }
});

test("时间点呈现：B站写成带 ?t= 的链接，点了跳网页对应秒", () => {
  const v: RemoteVideo = { platform: "bilibili", bvid: "BV1xx411c7mD" };
  assert.equal(
    timestampMarkdown(v, "01:30", 90),
    "[01:30](https://www.bilibili.com/video/BV1xx411c7mD?t=90)",
  );
});

test("时间点呈现：B站多P 带上分P参数，否则跳到第一P", () => {
  const v: RemoteVideo = { platform: "bilibili", bvid: "BV1xx411c7mD", page: 3 };
  assert.equal(
    timestampMarkdown(v, "01:30", 90),
    "[01:30](https://www.bilibili.com/video/BV1xx411c7mD?p=3&t=90)",
  );
});

test("时间点呈现：拿不到 BV 号时降级成纯标注，不给假链接", () => {
  const shortLink: RemoteVideo = { platform: "bilibili" };
  assert.equal(timestampMarkdown(shortLink, "01:30", 90), "`01:30`");
});

test("时间点呈现：抖音/小红书没有跳秒能力，只能做位置标注", () => {
  for (const platform of ["douyin", "xhs"] as const) {
    assert.equal(timestampMarkdown({ platform }, "01:30", 90), "`01:30`", platform);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { baseName, extOf, isMediaName, mimeOf, safeFileName } from "../src/media";

test("扩展名判断：大小写不敏感，认不出就不是媒体", () => {
  assert.equal(extOf("讲座.MP4"), "mp4");
  assert.equal(isMediaName("讲座.MP4"), true);
  assert.equal(isMediaName("笔记.md"), false);
  assert.equal(isMediaName("没有扩展名"), false);
});

test("MIME：认不出时回退通用二进制，不瞎猜", () => {
  assert.equal(mimeOf("a.m4a"), "audio/mp4");
  assert.equal(mimeOf("b.xyz"), "application/octet-stream");
});

test("标题：去掉扩展名，只取最后一段", () => {
  assert.equal(baseName("第 3 讲 · 方法论.mp3"), "第 3 讲 · 方法论");
  assert.equal(baseName("no-ext"), "no-ext");
});

test("文件名清洗：Obsidian 不允许的字符换成空格，长名字截断", () => {
  assert.equal(safeFileName('a/b:c*d?e"f<g>h|i#j^k[l].md'), "a b c d e f g h i j k l .md");
  assert.equal(safeFileName("   "), "未命名");
  assert.equal(safeFileName("长".repeat(200)).length, 80);
});

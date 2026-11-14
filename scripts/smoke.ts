/**
 * 冒烟脚本：用真实 Key 走一遍「上传 → 轮询 → 生成 Markdown」，不经过 Obsidian。
 *
 * 为什么要有它：插件里最容易坏的是接口契约（上传返回多一层嵌套、任务号藏在 duplicate_files、
 * 字段改名），这些在 Obsidian 里靠手点一遍很难复现也很难定位。用 Node 跑一遍几秒钟就能确认。
 *
 * 用法：
 *   AIDITING_KEY=sk-diting-xxx npx tsx scripts/smoke.ts /path/to/lecture.mp3
 *   AIDITING_KEY=... AIDITING_BASE=https://api.diting.cc npx tsx scripts/smoke.ts foo.mp4 --out /tmp
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { AiditingApi, MAX_FILE_BYTES } from "../src/api";
import { baseName, mimeOf, safeFileName } from "../src/media";
import { buildNote } from "../src/note";
import type { Transport } from "../src/transport";

const fetchTransport: Transport = async (req) => {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body ? new Uint8Array(req.body) : undefined,
  });
  return { status: res.status, text: await res.text() };
};

async function main(): Promise<void> {
  const file = process.argv[2];
  const outIndex = process.argv.indexOf("--out");
  const outDir = outIndex > -1 ? process.argv[outIndex + 1] : ".";
  const key = process.env.AIDITING_KEY ?? "";
  const base = (process.env.AIDITING_BASE ?? "https://api.diting.cc").replace(/\/+$/, "");

  if (!file || !key) {
    console.error("用法：AIDITING_KEY=sk-diting-xxx npx tsx scripts/smoke.ts <音视频文件> [--out 目录]");
    process.exit(1);
  }

  const buf = readFileSync(file);
  if (buf.byteLength > MAX_FILE_BYTES) {
    console.error(`文件 ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB，超过 200MB 上限。`);
    process.exit(1);
  }

  const name = basename(file);
  const api = new AiditingApi(base, key, fetchTransport);
  const started = Date.now();

  console.log(`上传 ${name}（${(buf.byteLength / 1024 / 1024).toFixed(1)}MB，${mimeOf(name)}）→ ${base}`);
  const taskId = await api.upload(name, mimeOf(name), buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  console.log(`已提交，任务号 ${taskId}`);

  let last = "";
  const task = await api.waitForTask(
    taskId,
    (t) => {
      const line = `${t.status} ${typeof t.progress === "number" ? t.progress + "%" : ""}`.trim();
      if (line !== last) {
        last = line;
        console.log(`  ${line}（${Math.round((Date.now() - started) / 1000)}s）`);
      }
    },
    { intervalMs: 5000 },
  );

  if (task.status !== "completed") {
    console.error(`任务没有完成：${task.status} ${task.errorMessage ?? ""}`);
    process.exit(1);
  }

  const note = buildNote(task, {
    sourceName: name,
    title: safeFileName(baseName(name)),
    taskId,
    apiBase: base,
    sectionMinutes: 10,
  });

  const outPath = join(outDir, `${safeFileName(baseName(name))}.md`);
  writeFileSync(outPath, note, "utf-8");

  const chars = note.replace(/\s/g, "").length;
  const stamps = (note.match(/^- `\d/gm) ?? []).length;
  const sections = (note.match(/^### \[/gm) ?? []).length;

  console.log("");
  console.log(`✓ 已写出 ${outPath}`);
  console.log(`  正文 ${chars} 字 · 章节 ${sections} 段 · 时间戳行 ${stamps} 条`);
  console.log(`  摘要：${task.summary ? "有" : "无（后处理可能还没跑完）"}`);
}

main().catch((err: unknown) => {
  console.error("✗ 冒烟失败：", err instanceof Error ? err.message : err);
  process.exit(1);
});

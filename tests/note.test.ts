import assert from "node:assert/strict";
import test from "node:test";
import { buildNote, formatDuration, parseTimedLines, toSeconds } from "../src/note";
import type { TaskView } from "../src/api";

/**
 * 只测纯函数（解析 + 拼 Markdown）。
 * 上传、轮询、落库依赖 Obsidian 运行时与真实网络，不在单测里假装能跑。
 */

test("时间戳解析：mm:ss 与 hh:mm:ss 都认", () => {
  assert.equal(toSeconds("00:12"), 12);
  assert.equal(toSeconds("12:34"), 754);
  assert.equal(toSeconds("1:02:30"), 3750);
});

test("时间戳解析：无时间戳的行接到上一条后面，不另起一句", () => {
  const lines = parseTimedLines("[00:05] 第一句说了一半\n接着说完。\n\n[00:20] 第二句");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].ts, "00:05");
  assert.equal(lines[0].text, "第一句说了一半 接着说完。");
  assert.equal(lines[1].text, "第二句");
});

test("时长格式化：不足一小时不显示小时位", () => {
  assert.equal(formatDuration(65), "01:05");
  assert.equal(formatDuration(3750), "01:02:30");
});

test("笔记：有摘要就写摘要段，没有就不写（不补空话）", () => {
  const base: TaskView = {
    taskId: "tsk_1",
    status: "completed",
    durationSeconds: 3750,
    textWithTimestamp: "[00:00] 开场\n[12:00] 中段\n[25:00] 结尾",
    text: "开场 中段 结尾",
    summary: "三句话的摘要",
  };

  const withSummary = buildNote(base, {
    sourceName: "lecture.mp4",
    title: "讲座",
    taskId: "tsk_1",
    apiBase: "https://api.diting.cc",
    sectionMinutes: 10,
  });
  assert.match(withSummary, /## 摘要/);
  assert.match(withSummary, /三句话的摘要/);
  assert.match(withSummary, /这是 AI 整理的初稿/);
  assert.match(withSummary, /aiditing_task: "tsk_1"/);

  const noSummary = buildNote({ ...base, summary: undefined }, {
    sourceName: "lecture.mp4",
    title: "讲座",
    taskId: "tsk_1",
    apiBase: "https://api.diting.cc",
    sectionMinutes: 10,
  });
  assert.doesNotMatch(noSummary, /## 摘要/);
});

test("笔记：按 N 分钟切章节（0/12/25 分钟 → 三段）", () => {
  const note = buildNote(
    {
      taskId: "tsk_2",
      status: "completed",
      durationSeconds: 1800,
      textWithTimestamp: "[00:00] 开场\n[12:00] 中段\n[25:00] 结尾",
      text: "开场 中段 结尾",
    },
    {
      sourceName: "a.mp3",
      title: "a",
      taskId: "tsk_2",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 10,
    },
  );

  const sections = note.match(/^### \[/gm) ?? [];
  assert.equal(sections.length, 3);
  assert.match(note, /### \[00:00\] 第 1 段/);
  assert.match(note, /### \[25:00\] 第 3 段/);
});

test("笔记：关掉章节切分时整篇只有一节", () => {
  const note = buildNote(
    {
      taskId: "tsk_3",
      status: "completed",
      textWithTimestamp: "[00:00] 第一句\n[30:00] 最后一句",
      text: "第一句 最后一句",
    },
    {
      sourceName: "b.mp3",
      title: "b",
      taskId: "tsk_3",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 0,
    },
  );
  assert.equal((note.match(/^### \[/gm) ?? []).length, 1);
});

test("笔记：文件名里的引号不会把 YAML 弄坏", () => {
  const note = buildNote(
    { taskId: "tsk_4", status: "completed", text: "正文" },
    {
      sourceName: 'A "quoted" name.mp3',
      title: 'A "quoted" name',
      taskId: "tsk_4",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 10,
    },
  );
  const front = note.split("---")[1];
  assert.match(front, /source: "A \\"quoted\\" name\.mp3"/);
});

test("笔记：正文为空时抛错，而不是写一篇空笔记", () => {
  assert.throws(
    () =>
      buildNote(
        { taskId: "tsk_5", status: "completed", text: "", textWithTimestamp: "" },
        {
          sourceName: "c.mp3",
          title: "c",
          taskId: "tsk_5",
          apiBase: "https://api.diting.cc",
          sectionMinutes: 10,
        },
      ),
    /没有正文/,
  );
});

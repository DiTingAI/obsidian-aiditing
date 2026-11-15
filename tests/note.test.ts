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

test("时间戳解析：认后端真实格式 [起 - 止]（含毫秒与区间）", () => {
  // 2026-11-15 线上事故回归：后端 utils/nls/nls_format.go 输出的是
  //   [00:12.340 - 00:15.200] 正文
  // 旧正则只认 [00:12] 正文，结果一行都匹配不上，整篇静默退化成纯文本——
  // 笔记里既没有章节也没有逐句时间戳，而 README 承诺的正是「点回去能听到原话」。
  const lines = parseTimedLines(
    "[00:12.340 - 00:15.200] 第一句\n[00:15.200 - 00:18.900] 第二句\n[01:02:03.500 --> 01:02:06.000] 第三句",
  );
  assert.equal(lines.length, 3);
  assert.equal(lines[0].ts, "00:12");
  assert.equal(lines[0].text, "第一句");
  assert.equal(lines[1].ts, "00:15");
  assert.equal(lines[2].ts, "01:02:03");
  assert.deepEqual(lines.map((l) => l.seconds), [12, 15, 3723]);
});

test("笔记：后端区间格式也能切章节、保留逐句时间戳（不止是纯文本）", () => {
  const note = buildNote(
    {
      taskId: "tsk_nls",
      status: "completed",
      durationSeconds: 720,
      textWithTimestamp: "[00:00.000 - 00:03.200] 开场白\n[11:30.000 - 11:33.500] 第二段",
      text: "开场白 第二段",
    },
    {
      sourceName: "clip.mov",
      title: "clip",
      taskId: "tsk_nls",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 10,
    },
  );
  assert.match(note, /### \[00:00\] 第 1 段/);
  assert.match(note, /### \[11:30\] 第 2 段/);
  assert.match(note, /- `00:00` 开场白/);
  assert.match(note, /## 纯文本/);
});

test("笔记：开启嵌入时，原媒体以 Obsidian 原生嵌入出现在正文开头", () => {
  // 2026-11-15：逐句时间点若不能在同一页对照播放器，用户核对一句话要来回切窗口，
  // 「逐句可核对」就退化成「逐句很啰嗦」。嵌入原媒体是让这个卖点成立的前提。
  const note = buildNote(
    {
      taskId: "tsk_embed",
      status: "completed",
      textWithTimestamp: "[00:05] 第一句",
      text: "第一句",
    },
    {
      sourceName: "讲座录音.m4a",
      title: "讲座录音",
      taskId: "tsk_embed",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 10,
      embedSource: true,
    },
  );
  assert.match(note, /!\[\[讲座录音\.m4a\]\]/);
  // 嵌入必须在正文之前，否则用户翻半天才找到播放器
  assert.ok(note.indexOf("![[") < note.indexOf("## 正文"));

  const noEmbed = buildNote(
    { taskId: "tsk_embed", status: "completed", textWithTimestamp: "[00:05] 第一句", text: "第一句" },
    {
      sourceName: "讲座录音.m4a",
      title: "讲座录音",
      taskId: "tsk_embed",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 10,
    },
  );
  assert.doesNotMatch(noEmbed, /!\[\[/);
});

test("笔记：文件名带 wiki 链接保留字符时不嵌入（宁可不嵌，也不要坏链接）", () => {
  for (const name of ["a[1].mp3", "a|b.mp3", "a#1.mp3"]) {
    const note = buildNote(
      { taskId: "tsk_bad", status: "completed", textWithTimestamp: "[00:05] 一句", text: "一句" },
      {
        sourceName: name,
        title: "x",
        taskId: "tsk_bad",
        apiBase: "https://api.diting.cc",
        sectionMinutes: 10,
        embedSource: true,
      },
    );
    assert.doesNotMatch(note, /!\[\[/, `${name} 不应该被嵌入`);
  }
});

test("笔记：开头说明承诺「点一下时间点就跳转」（0.1.7 起已实现，文案跟着改）", () => {
  // 0.1.6 及之前这句写的是「对照播放器的时间轴拖动即可回听」——因为当时点不动。
  // 0.1.7 起 seek.ts 会给行内代码时间点挂点击事件，文案必须同步，否则用户不知道能点。
  const note = buildNote(
    { taskId: "tsk_copy", status: "completed", textWithTimestamp: "[00:05] 一句", text: "一句" },
    {
      sourceName: "a.mp3",
      title: "a",
      taskId: "tsk_copy",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 10,
    },
  );
  assert.match(note, /点一下就会跳到那句话的原声/);
  assert.doesNotMatch(note, /拖动即可回听/);
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

test("时间戳解析：认无括号的 `hh:mm:ss - 正文`（线上真实格式）", () => {
  // 2026-11-15 查生产库 video_processing_tasks.transcript_with_timestamp 确认：
  // 真实内容是「00:00:00 - 正文」，没有方括号。旧正则要求 ^\[ ，
  // 这类数据一条都匹配不上，整篇静默退化成纯文本、时间点全丢。
  const lines = parseTimedLines(
    "00:00:00 - 你的打野打法说得听点，叫随机应变\n00:00:08 - 你就得跟着节奏走",
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].ts, "00:00:00");
  assert.equal(lines[0].seconds, 0);
  assert.equal(lines[1].ts, "00:00:08");
  assert.equal(lines[1].seconds, 8);
  assert.match(lines[1].text, /跟着节奏/);
});

test("时间戳解析：无括号又没有区间分隔符的普通正文不被误判", () => {
  // 「12:30 会议室集合」是人话不是时间点。没有 - / --> 就不认，
  // 否则正文会被切碎成一句一段。
  const lines = parseTimedLines("[00:05] 先有一句\n12:30 会议室集合");
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /会议室集合/);
});

test("笔记：无括号格式也能切章节，并写成可点的行内代码", () => {
  const note = buildNote(
    {
      taskId: "tsk_bare",
      status: "completed",
      textWithTimestamp: "00:00:00 - 第一句话\n00:00:08 - 第二句话",
      text: "第一句话第二句话",
    },
    {
      sourceName: "b.mp4",
      title: "b",
      taskId: "tsk_bare",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 0,
    },
  );
  assert.match(note, /`00:00:00`/);
  assert.match(note, /`00:00:08`/);
  assert.doesNotMatch(note, /这次的结果没有时间点/);
});

test("笔记：拿不到时间戳时明确告知，而不是静默退化", () => {
  // 静默退化会让人以为是插件不支持，也会掩盖后端返回格式的问题。
  const note = buildNote(
    { taskId: "tsk_plain", status: "completed", text: "只有纯文本" },
    {
      sourceName: "c.mp3",
      title: "c",
      taskId: "tsk_plain",
      apiBase: "https://api.diting.cc",
      sectionMinutes: 10,
    },
  );
  assert.match(note, /这次的结果没有时间点/);
  assert.match(note, /只有纯文本/);
});

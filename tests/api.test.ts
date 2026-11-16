import assert from "node:assert/strict";
import test from "node:test";
import { AiditingApi, extractTaskId, matchPart } from "../src/api";
import type { Transport, TransportRequest } from "../src/transport";
import { installWindowTimer } from "./node-window";

// src/timer.ts 只用 window.setTimeout（Obsidian 目录扫描的硬要求），Node 里必须补个垫片
installWindowTimer();

/**
 * 用假传输层测客户端。
 * 覆盖的是真出过错的地方：multipart 拼装、任务号的两层嵌套、去重回退、错误信息提取。
 */

function mockTransport(
  handler: (req: TransportRequest) => { status: number; text: string },
): { transport: Transport; calls: TransportRequest[] } {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    calls.push(req);
    return handler(req);
  };
  return { transport, calls };
}

function bodyText(req: TransportRequest): string {
  assert.ok(req.body, "上传请求必须带 body");
  return new TextDecoder().decode(req.body);
}

/**
 * 平台链接转写（B站 / 抖音 / 小红书）。
 *
 * 这三个端点的请求与响应结构互不相同，是最容易写错的地方：
 *   B站 check   → parts[]，duration 是字符串 "MM:SS"
 *   抖音/小红书  → 单条，duration 是整数秒
 *   B站 submit  → 请求体是 videos[] 数组，响应 task_ids[]
 *   抖音/小红书  → 请求体是单条，响应 task_id
 * 这里把每种结构都钉死，避免「参数错误」这种看不出根因的线上问题。
 */

function jsonResponse(payload: unknown, status = 200): { status: number; text: string } {
  return { status, text: JSON.stringify(payload) };
}

test("平台检查：B站单P，时长字符串被解析成秒，同时保留原文", async () => {
  const { transport, calls } = mockTransport(() =>
    jsonResponse({
      code: "0",
      data: {
        is_multi_part: false,
        video_type: "single",
        title: "某个视频",
        duration: "12:30",
        thumbnail: "https://i0.hdslb.com/a.jpg",
        parts: [
          {
            url: "https://www.bilibili.com/video/BV1xx411c7mD",
            bvid: "BV1xx411c7mD",
            aid: 111,
            cid: 222,
            duration: "12:30",
            thumbnail: "https://i0.hdslb.com/a.jpg",
            title: "第一P",
          },
        ],
      },
    }),
  );

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const r = await api.checkPlatform({
    platform: "bilibili",
    url: "https://www.bilibili.com/video/BV1xx411c7mD",
    bvid: "BV1xx411c7mD",
  });

  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "https://api.test/v1/transcriptions/bilibili/check");
  assert.equal(calls[0].headers.Authorization, "Bearer sk-test");
  assert.deepEqual(JSON.parse(bodyText(calls[0])), {
    video_url: "https://www.bilibili.com/video/BV1xx411c7mD",
  });

  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0].seconds, 750, "12:30 应换算成 750 秒");
  assert.equal(r.parts[0].durationText, "12:30", "提交时后端要原样的字符串时长");
  assert.equal(r.parts[0].page, 1);
  assert.equal(r.parts[0].bvid, "BV1xx411c7mD");
});

test("平台检查：B站多P，每个 part 拿到递增的分P序号", async () => {
  const part = (i: number) => ({
    url: `https://www.bilibili.com/video/BV1xx411c7mD?p=${i}`,
    bvid: "BV1xx411c7mD",
    aid: 1,
    cid: 100 + i,
    duration: "05:00",
    thumbnail: `https://i0.hdslb.com/${i}.jpg`,
    title: `第${i}P`,
  });

  const { transport } = mockTransport(() =>
    jsonResponse({
      code: "0",
      data: { is_multi_part: true, video_type: "multi_part", title: "合集", duration: "10:00", parts: [part(1), part(2), part(3)] },
    }),
  );

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const r = await api.checkPlatform({ platform: "bilibili", url: "https://b23.tv/x", });

  assert.equal(r.parts.length, 3);
  assert.deepEqual(r.parts.map((p) => p.page), [1, 2, 3]);
  assert.equal(r.parts[2].seconds, 300);
});

test("平台检查：抖音时长为整数秒，只有一个 part", async () => {
  const { transport, calls } = mockTransport(() =>
    jsonResponse({
      code: "0",
      data: {
        platform: "douyin",
        title: "某个短视频",
        duration: 95,
        cover: "https://p3.douyinpic.com/a.jpg",
        author: "某人",
        video_url_resolved: "https://www.douyin.com/video/123",
      },
    }),
  );

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const r = await api.checkPlatform({ platform: "douyin", url: "https://v.douyin.com/abc/" });

  assert.equal(calls[0].url, "https://api.test/v1/transcriptions/douyin/check");
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0].seconds, 95);
  assert.equal(r.parts[0].page, 1);
  assert.equal(r.title, "某个短视频");
});

test("平台提交：B站请求体是 videos[] 数组，返回 task_ids 与同序 file_names", async () => {
  const { transport, calls } = mockTransport(() =>
    jsonResponse({
      code: "0",
      data: {
        task_ids: ["tsk_a", "tsk_b"],
        file_names: ["P1.mp4", "P2.mp4"],
        success_count: 2,
        total_count: 2,
      },
    }),
  );

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const parts = [
    { url: "https://www.bilibili.com/video/BV1xx411c7mD?p=1", title: "P1", seconds: 300, durationText: "05:00", page: 1, bvid: "BV1xx411c7mD", thumbnail: "https://t/1.jpg", aid: 1, cid: 11 },
    { url: "https://www.bilibili.com/video/BV1xx411c7mD?p=2", title: "P2", seconds: 310, durationText: "05:10", page: 2, bvid: "BV1xx411c7mD", thumbnail: "https://t/2.jpg", aid: 1, cid: 12 },
  ];

  const { taskIds: ids, fileNames } = await api.submitPlatform({ platform: "bilibili", url: "https://www.bilibili.com/video/BV1xx411c7mD", bvid: "BV1xx411c7mD" }, parts);

  assert.equal(calls[0].url, "https://api.test/v1/transcriptions/bilibili");
  const body = JSON.parse(bodyText(calls[0]));
  assert.equal(body.videos.length, 2);
  assert.equal(body.videos[0].url, "https://www.bilibili.com/video/BV1xx411c7mD?p=1");
  assert.equal(body.videos[0].duration, "05:00", "B站要求字符串时长");
  assert.equal(body.videos[0].title, "P1");
  assert.deepEqual(ids, ["tsk_a", "tsk_b"]);
  assert.deepEqual(fileNames, ["P1.mp4", "P2.mp4"]);
});

test("平台提交：抖音请求体是单条，返回单个 task_id 被包成数组", async () => {
  const { transport, calls } = mockTransport(() =>
    jsonResponse({ code: "0", data: { task_id: "tsk_d", file_name: "x.mp4", platform: "douyin" } }),
  );

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const { taskIds: ids, fileNames } = await api.submitPlatform(
    { platform: "douyin", url: "https://www.douyin.com/video/123" },
    [{ url: "https://www.douyin.com/video/123", title: "短视频", seconds: 95, durationText: "01:35", page: 1, thumbnail: "https://c/a.jpg" }],
  );

  assert.equal(calls[0].url, "https://api.test/v1/transcriptions/douyin");
  const body = JSON.parse(bodyText(calls[0]));
  assert.equal(body.video_url, "https://www.douyin.com/video/123");
  assert.equal(body.duration, 95, "抖音要整数秒");
  assert.equal(body.title, "短视频");
  assert.deepEqual(ids, ["tsk_d"]);
  assert.deepEqual(fileNames, ["x.mp4"]);
});

/**
 * 任务号与「哪一集」的配对。
 *
 * 服务端 `ProcessBilibiliMultiP` 是多 goroutine 并发建任务的（semaphore 限制并发数），
 * `task_ids` 的 append 顺序取决于谁先跑完，**不等于提交顺序**；失败的那几集还会被跳过。
 * 按索引配对会把第 3 集的正文写成第 1 集的标题和链接，时间点还跳到错误的 P。
 */
test("任务配对：task_ids 顺序被打乱时，按 file_names 反查回正确的那一集", () => {
  const parts = [
    { url: "u1", title: "第1P 开场", seconds: 100, durationText: "01:40", page: 1 },
    { url: "u2", title: "第2P 中段", seconds: 200, durationText: "03:20", page: 2 },
    { url: "u3", title: "第3P 收尾", seconds: 300, durationText: "05:00", page: 3 },
  ];
  // 服务端实际返回顺序：第 3P 先建完
  const fileNames = ["第3P 收尾.mp4", "第1P 开场.mp4", "第2P 中段.mp4"];

  assert.equal(matchPart(parts, fileNames[0], 0)?.page, 3);
  assert.equal(matchPart(parts, fileNames[1], 1)?.page, 1);
  assert.equal(matchPart(parts, fileNames[2], 2)?.page, 2);
});

test("任务配对：中间某一集建失败被跳过时，后面的任务不会错配到前一集", () => {
  const parts = [
    { url: "u1", title: "第1P", seconds: 100, durationText: "01:40", page: 1 },
    { url: "u2", title: "第2P", seconds: 200, durationText: "03:20", page: 2 },
    { url: "u3", title: "第3P", seconds: 300, durationText: "05:00", page: 3 },
  ];
  // 第 2P 失败，task_ids 只有两条，且顺序是 3P → 1P
  const fileNames = ["第3P.mp4", "第1P.mp4"];

  assert.equal(matchPart(parts, fileNames[0], 0)?.page, 3, "按索引会错配成第 1P");
  assert.equal(matchPart(parts, fileNames[1], 1)?.page, 1);
});

test("任务配对：拿不到文件名时退回索引（降级，不是等价方案）", () => {
  const parts = [
    { url: "u1", title: "第1P", seconds: 100, durationText: "01:40", page: 1 },
    { url: "u2", title: "第2P", seconds: 200, durationText: "03:20", page: 2 },
  ];
  assert.equal(matchPart(parts, undefined, 1)?.page, 2);
});

test("任务配对：文件名只按已知媒体扩展名去尾，标题里的点号不被误削", () => {
  const parts = [{ url: "u1", title: "第 1.P 讲解", seconds: 100, durationText: "01:40", page: 1 }];
  assert.equal(matchPart(parts, "第 1.P 讲解.mp4", 0)?.page, 1);
  assert.equal(matchPart([{ url: "u", title: "第 1", seconds: 1, durationText: "00:01", page: 1 }], "第 1.mp4", 0)?.title, "第 1");
});

test("平台接口：额度不足的错误信息要原样透出，不能吞成「参数错误」", async () => {
  const { transport } = mockTransport(() =>
    jsonResponse({ code: "E2004", message: "可用时长不足，请先充值" }, 402),
  );

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  await assert.rejects(
    api.checkPlatform({ platform: "xhs", url: "https://xhslink.com/abc" }),
    /可用时长不足/,
  );
});

test("上传：multipart 结构正确，文件名里的引号被转义", async () => {
  const { transport, calls } = mockTransport(() => ({
    status: 200,
    text: JSON.stringify({ code: "0", data: { data: { task_ids: ["tsk_1"] } } }),
  }));

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const audio = new TextEncoder().encode("fake-audio-bytes");
  const taskId = await api.upload('讲课 "第一讲".mp4', "video/mp4", audio.buffer as ArrayBuffer);

  assert.equal(taskId, "tsk_1");
  const req = calls[0];
  assert.match(req.headers["Content-Type"], /^multipart\/form-data; boundary=----aiditing/);
  assert.equal(req.headers.Authorization, "Bearer sk-test");

  const text = bodyText(req);
  assert.match(text, /name="file"; filename="讲课 _第一讲_\.mp4"/);
  assert.match(text, /Content-Type: video\/mp4/);
  assert.ok(text.startsWith("--"), "body 必须以 boundary 开头");
  assert.ok(text.trimEnd().endsWith("--"), "body 必须以结束 boundary 收尾");
});

test("任务号：上传接口多套一层也能取到", () => {
  assert.equal(extractTaskId({ data: { data: { task_ids: ["tsk_a"] } } }), "tsk_a");
  assert.equal(extractTaskId({ data: { taskId: "tsk_b" } }), "tsk_b");
  assert.equal(extractTaskId({ data: { task_id: "tsk_c" } }), "tsk_c");
});

test("任务号：内容去重命中时从 duplicate_files 里回退取已有任务", () => {
  const payload = {
    data: {
      data: {
        task_ids: null,
        duplicate_files: [{ existing_task_id: "tsk_dup" }],
      },
    },
  };
  assert.equal(extractTaskId(payload), "tsk_dup");
});

test("上传失败：把后端 message 抛出来，不吞成 HTTP 状态码", async () => {
  const { transport } = mockTransport(() => ({
    status: 429,
    text: JSON.stringify({ code: "E2001", message: "超出并发限制，请稍后再试" }),
  }));

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  await assert.rejects(
    () => api.upload("a.mp3", "audio/mpeg", new ArrayBuffer(4)),
    /超出并发限制/,
  );
});

test("查询：404 提示任务不存在，而不是笼统的查询失败", async () => {
  const { transport } = mockTransport(() => ({ status: 404, text: "{}" }));
  const api = new AiditingApi("https://api.test", "sk-test", transport);
  await assert.rejects(() => api.getTask("tsk_missing"), /任务不存在或已过期/);
});

test("轮询：处理中会持续回调，完成即停", async () => {
  const states = [
    { status: "queued", progress: 0 },
    { status: "processing", progress: 40 },
    { status: "completed", progress: 100, text: "正文" },
  ];
  let i = 0;

  const { transport } = mockTransport(() => {
    const data = states[Math.min(i, states.length - 1)];
    i += 1;
    return { status: 200, text: JSON.stringify({ code: "0", data: { taskId: "tsk_w", ...data } }) };
  });

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const ticks: string[] = [];

  const done = await api.waitForTask("tsk_w", (t) => ticks.push(t.status), { intervalMs: 0 });
  assert.equal(done.status, "completed");
  assert.deepEqual(ticks, ["queued", "processing"]);
});

test("轮询：失败状态直接返回，不当成还在跑", async () => {
  const { transport } = mockTransport(() => ({
    status: 200,
    text: JSON.stringify({ code: "0", data: { taskId: "tsk_f", status: "failed", errorMessage: "格式不支持" } }),
  }));

  const api = new AiditingApi("https://api.test", "sk-test", transport);
  const task = await api.waitForTask("tsk_f", () => undefined, { intervalMs: 0 });
  assert.equal(task.status, "failed");
  assert.equal(task.errorMessage, "格式不支持");
});

/**
 * 客户端标识：服务端靠 X-Aiditing-Client 把任务记成 obsidian。
 *
 * 不发的后果不是报错，而是静默降级——带着 API Key 又没自报家门的请求会被记成 api，
 * 插件从此在「按端统计」里消失。这种错只有靠断言每个请求都带头才拦得住，
 * 所以三个入口（上传 / 查状态 / 提交）各钉一条。
 */
const CLIENT_HEADER = "X-Aiditing-Client";

function headerOf(req: TransportRequest, name: string): string | undefined {
  const headers = req.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

test("Key 不上报：Key 只出现在 Authorization 头，URL 和其它头都不带", async () => {
  // Key 一旦进 URL，就会跟着 Nginx access log / 浏览器历史 / 代理日志到处留痕。
  // 这条断言是「以后有人图省事把 key 拼进 query」的拦路石。
  const key = "sk-diting-SECRET1234567890";
  const { transport, calls } = mockTransport((req) => {
    if (req.url.includes("/check")) {
      return jsonResponse({ data: { title: "t", duration: "01:00", parts: [{ url: "u", title: "P1", duration: "01:00" }] } });
    }
    if (req.url.includes("/bilibili")) return jsonResponse({ data: { task_ids: ["tsk_1"] } });
    if (req.url.includes("/transcriptions/tsk_1")) {
      return jsonResponse({ data: { taskId: "tsk_1", status: "completed", text: "正文" } });
    }
    return jsonResponse({ data: { taskId: "tsk_1" } });
  });

  const api = new AiditingApi("https://api.test", key, transport);
  await api.upload("a.mp3", "audio/mpeg", new ArrayBuffer(8));
  await api.getTask("tsk_1");
  const checked = await api.checkPlatform({ platform: "bilibili", url: "https://www.bilibili.com/video/BV1xx411c7mD" });
  await api.submitPlatform({ platform: "bilibili", url: "https://www.bilibili.com/video/BV1xx411c7mD" }, checked.parts);

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.ok(!call.url.includes(key), `${call.url} 不能把 Key 放进 URL`);
    assert.ok(!call.url.includes("SECRET1234567890"), `${call.url} 连 Key 片段都不能有`);

    for (const [name, value] of Object.entries(call.headers ?? {})) {
      if (name.toLowerCase() === "authorization") continue;
      assert.ok(!String(value).includes("SECRET1234567890"), `${name} 不该带 Key`);
    }
    // 请求体里也不能夹带 Key
    if (call.body) {
      assert.ok(!new TextDecoder().decode(call.body).includes("SECRET1234567890"), "body 不该带 Key");
    }
  }
});

test("Key 不上报：后端把 Key 回显在错误信息里时，抛出的文案要脱敏", async () => {
  // 网关/代理回显请求头是常见事故。原样透传 = Key 跟着 Notice 出现在界面上，
  // 用户截图求助的那一刻就泄露了。
  const { transport } = mockTransport(() =>
    jsonResponse({ message: "invalid api key: sk-diting-abcdefgh12345678", }, 401),
  );

  const api = new AiditingApi("https://api.test", "sk-diting-abcdefgh12345678", transport);
  await assert.rejects(
    () => api.upload("a.mp3", "audio/mpeg", new ArrayBuffer(4)),
    (err: Error) => {
      assert.match(err.message, /invalid api key/);
      assert.ok(!err.message.includes("abcdefgh12345678"), "Key 明文必须被抹掉");
      assert.match(err.message, /sk-\*\*\*/);
      return true;
    },
  );
});

test("客户端标识：上传、查状态、提交三条请求都带 X-Aiditing-Client", async () => {
  const { transport, calls } = mockTransport((req) => {
    if (req.url.includes("/check")) {
      return jsonResponse({
        data: { title: "某个视频", duration: "01:00", parts: [{ url: "u", title: "P1", duration: "01:00" }] },
      });
    }
    if (req.url.includes("/bilibili")) {
      return jsonResponse({ data: { task_ids: ["tsk_1"] } });
    }
    return jsonResponse({ data: { taskId: "tsk_1", status: "completed", text: "正文" } });
  });

  const api = new AiditingApi("https://api.test", "sk-test", transport);

  await api.upload("a.mp3", "audio/mpeg", new ArrayBuffer(8));
  await api.getTask("tsk_1");
  const checked = await api.checkPlatform({ platform: "bilibili", url: "https://www.bilibili.com/video/BV1xx411c7mD" });
  await api.submitPlatform(
    { platform: "bilibili", url: "https://www.bilibili.com/video/BV1xx411c7mD" },
    checked.parts,
  );

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(headerOf(call, CLIENT_HEADER), "obsidian", `${call.url} 必须带客户端标识`);
  }
});

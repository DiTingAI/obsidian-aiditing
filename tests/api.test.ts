import assert from "node:assert/strict";
import test from "node:test";
import { AiditingApi, extractTaskId } from "../src/api";
import type { Transport, TransportRequest } from "../src/transport";

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

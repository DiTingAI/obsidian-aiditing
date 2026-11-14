import { requestUrl } from "obsidian";
import type { Transport } from "./transport";

/**
 * 插件运行时用的传输实现。
 *
 * 用 requestUrl 而不是 fetch：
 * 插件跑在渲染进程里，fetch 会被 CORS 拦（api.diting.cc 不会给 obsidian.md 开 origin）；
 * requestUrl 由主进程发出，不受这个限制。
 */
export const obsidianTransport: Transport = async (req) => {
  const res = await requestUrl({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    throw: false,
  });
  return { status: res.status, text: res.text };
};

/**
 * 传输层抽象。
 *
 * 存在的理由：Obsidian 里只能用 requestUrl（跨 CORS、走主进程），Node 里没有 requestUrl。
 * 把「发请求」抽成一个函数，API 客户端就能同时跑在插件里、单测里和冒烟脚本里——
 * 否则上传解析、任务号提取这些最容易出错的地方，只能靠人手在 Obsidian 里点一遍来验。
 */

export interface TransportRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: ArrayBuffer;
}

export interface TransportResponse {
  status: number;
  text: string;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

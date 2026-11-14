/**
 * 媒体文件判定与命名（纯函数，不碰 Obsidian API）。
 *
 * 拆出来的原因：文件名清洗、扩展名判断这些逻辑插件和冒烟脚本都要用，
 * 而且它们最容易在中文文件名、引号、冒号上出错——放在这里能直接单测。
 */

/** 与网页上传接受的类型保持一致；插件不做转码，认不出的扩展名直接拒 */
export const MEDIA_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  opus: "audio/opus",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
};

export function extOf(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function isMediaName(name: string): boolean {
  return extOf(name) in MEDIA_MIME;
}

/** 认不出的扩展名回退成通用二进制类型，让后端的格式校验去报错，而不是插件先编一个 MIME */
export function mimeOf(name: string): string {
  return MEDIA_MIME[extOf(name)] ?? "application/octet-stream";
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * 文件名清洗：Obsidian 不允许出现 \ / : * ? " < > | # ^ [ ]，
 * 顺手把连续空格压成一个、过长的名字截断——超长中文标题在部分文件系统上会建不出来。
 */
export function safeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|#^[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "未命名"
  );
}

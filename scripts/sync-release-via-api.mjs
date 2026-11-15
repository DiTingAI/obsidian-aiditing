#!/usr/bin/env node
/**
 * 发布仓库的备用同步通道（release-obsidian.sh 在 clone 不通时自动调用）。
 *
 * 为什么需要它：`git clone` 在某些网络环境下会直接崩，实测 2026-11-15 撞到两种：
 *
 *   fatal: unable to access 'https://github.com/...': Error in the HTTP2 framing layer
 *   fatal: unable to access 'https://github.com/...': Failed to connect to port 443 after 75024 ms
 *
 * 同一台机器上 `git ls-remote` 正常、`curl https://api.github.com` 也正常——
 * 也就是说 Release 与资产上传（走 api.github.com / uploads.github.com）不受影响，
 * 只有 clone/push 这条长连接通道会断。这种情况下发版不该整个 abort。
 *
 * 这里用 Git Data API 一次性提交所有文件（blobs → tree → commit → 挪 ref），
 * 效果等价于 git push，只是走 HTTPS API。一次一个 commit，不会把历史弄碎。
 *
 * 用法：
 *   GH_TOKEN=xxx node scripts/sync-release-via-api.mjs            # 真同步
 *   GH_TOKEN=xxx node scripts/sync-release-via-api.mjs --dry-run  # 只列文件，不发请求
 *
 * 环境变量：
 *   GH_TOKEN / GITHUB_TOKEN  需要目标仓库 contents:write
 *   RELEASE_REPO             默认 DiTingAI/obsidian-aiditing
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.RELEASE_REPO ?? "DiTingAI/obsidian-aiditing";
const TOKEN = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
const BRANCH = "main";
const DRY_RUN = process.argv.includes("--dry-run");

/** 与 release-obsidian.sh 里 `cp` 的范围保持一致 */
const ROOT_FILES = [
  "main.js",
  "manifest.json",
  "styles.css",
  "versions.json",
  "README.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "esbuild.config.mjs",
  "tsconfig.json",
];

/** 目录 → 允许的扩展名 */
const DIRS = [
  ["src", [".ts"]],
  ["tests", [".ts"]],
  // .mjs 也要带上：release-obsidian.sh 的降级路径会调用 scripts/sync-release-via-api.mjs，
  // 少同步这一个文件，发布仓库里的脚本就是坏的
  ["scripts", [".sh", ".ts", ".mjs"]],
];

async function api(method, endpoint, body) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "aiditing-release-sync",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${endpoint} → ${res.status} ${text.slice(0, 400)}`);
  }
  return res.json();
}

async function collectFiles() {
  const files = [...ROOT_FILES];

  for (const [dir, exts] of DIRS) {
    let entries = [];
    try {
      entries = await readdir(path.join(ROOT, dir));
    } catch {
      continue; // 目录不存在就跳过，不因为可选目录把发版卡死
    }
    for (const name of entries.sort()) {
      if (exts.some((ext) => name.endsWith(ext))) files.push(`${dir}/${name}`);
    }
  }

  return files;
}

async function main() {
  if (!TOKEN && !DRY_RUN) {
    throw new Error("缺少 GH_TOKEN / GITHUB_TOKEN");
  }

  const files = await collectFiles();

  // 先全部读一遍：缺文件要在发请求之前就报错，别同步了一半
  const payloads = [];
  for (const rel of files) {
    payloads.push({ rel, content: await readFile(path.join(ROOT, rel)) });
  }

  console.log(`待同步 ${payloads.length} 个文件 → ${REPO}@${BRANCH}${DRY_RUN ? "（dry-run）" : ""}`);
  for (const p of payloads) console.log(`  - ${p.rel}`);

  if (DRY_RUN) {
    console.log("dry-run 结束，没有发任何请求");
    return;
  }

  const ref = await api("GET", `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const headCommit = await api("GET", `/repos/${REPO}/git/commits/${headSha}`);
  const baseTree = headCommit.tree.sha;

  const tree = [];
  for (const { rel, content } of payloads) {
    const blob = await api("POST", `/repos/${REPO}/git/blobs`, {
      content: content.toString("base64"),
      encoding: "base64",
    });
    tree.push({ path: rel, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await api("POST", `/repos/${REPO}/git/trees`, { base_tree: baseTree, tree });

  // 内容没变就别制造空 commit（重复发布同一版本时会走到这里）
  if (newTree.sha === baseTree) {
    console.log("内容与远端完全一致，跳过提交");
    return;
  }

  const version = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8")).version;
  const commit = await api("POST", `/repos/${REPO}/git/commits`, {
    message: `release ${version}`,
    tree: newTree.sha,
    parents: [headSha],
  });

  await api("PATCH", `/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: commit.sha,
    force: false,
  });

  console.log(`已提交 ${commit.sha.slice(0, 8)} → ${BRANCH}`);
}

main().catch((err) => {
  console.error("API 同步失败：", err.message);
  process.exit(1);
});

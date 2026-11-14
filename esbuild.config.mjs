/**
 * 构建脚本（Obsidian 官方模板同款思路）。
 *
 * 产物必须是根目录下的 main.js，CommonJS 格式，obsidian / electron 等由宿主提供，不能打进来。
 * 开发时带 watch，改完在 Obsidian 里「禁用再启用插件」即可热更。
 */
import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const banner = `/*
爱谛听 Obsidian 插件 —— 构建产物，请勿直接编辑。
协议：MIT（见仓库根 LICENSE）  说明：https://aiditing.cn/connect/obsidian
产物未压缩、未混淆，可直接阅读；源码随产品仓库维护，需要审阅可联系我们。
*/`;

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  // 发布产物不压缩、不混淆。
  // 社区插件审核要看代码，用户也有权审计一个会读本地文件、会往服务器传文件的插件；
  // 压缩后 15KB 的 bundle 没人读得动。treeShaking 已经去掉了没用的分支，未压缩约 40KB，
  // 对这个体量的插件加载耗时可忽略。
  minify: false,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}

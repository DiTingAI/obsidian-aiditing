import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettingValue, validateSetting } from "../src/settings-values";

/**
 * 设置值清洗。
 *
 * 为什么值得单独测：这两套渲染（声明式 getSettingDefinitions 与旧 display()）共用同一份清洗逻辑，
 * 一旦洗错，表现是「设置面板里填的值和插件实际用的值不一样」——
 * 用户看不出，我们也难复现（2026-11-16 审核 Warning 修完后新增）。
 */

test("API 地址：去掉首尾空白与结尾斜杠，避免拼出 //v1 被网关 404", () => {
  assert.equal(normalizeSettingValue("apiBase", "  https://api.diting.cc/  "), "https://api.diting.cc");
  assert.equal(normalizeSettingValue("apiBase", "https://api.diting.cc///"), "https://api.diting.cc");
  assert.equal(normalizeSettingValue("apiBase", "http://localhost:8080"), "http://localhost:8080");
});

test("API Key：只去空白，不动内容", () => {
  assert.equal(normalizeSettingValue("apiKey", "  sk-diting-abc123  "), "sk-diting-abc123");
  assert.equal(normalizeSettingValue("apiKey", ""), "");
});

test("落库目录：去掉首尾斜杠（带 / 会被当成绝对路径）", () => {
  assert.equal(normalizeSettingValue("targetFolder", "/00-Inbox/"), "00-Inbox");
  assert.equal(normalizeSettingValue("targetFolder", " 笔记/课程 "), "笔记/课程");
});

test("章节间隔：空输入回退 10，而不是当成 0（0 = 不切章节，行为相反）", () => {
  assert.equal(normalizeSettingValue("sectionMinutes", ""), 10);
  assert.equal(normalizeSettingValue("sectionMinutes", "   "), 10);
  assert.equal(normalizeSettingValue("sectionMinutes", 0), 0, "明确填 0 就是要不切章节");
  assert.equal(normalizeSettingValue("sectionMinutes", "15"), 15);
  assert.equal(normalizeSettingValue("sectionMinutes", "12.7"), 12);
  assert.equal(normalizeSettingValue("sectionMinutes", "abc"), 10);
  assert.equal(normalizeSettingValue("sectionMinutes", "-5"), 10);
});

test("三个开关：只认布尔，字符串 \"false\" 不会被当成 true", () => {
  assert.equal(normalizeSettingValue("confirmBeforeWrite", true), true);
  assert.equal(normalizeSettingValue("openAfterCreate", false), false);
  assert.equal(normalizeSettingValue("embedSource", "false"), false);
  assert.equal(normalizeSettingValue("embedSource", undefined), false);
});

test("校验：API 地址必须带 http(s)，空值单独给提示", () => {
  assert.match(String(validateSetting("apiBase", "")), /不能为空/);
  assert.match(String(validateSetting("apiBase", "api.diting.cc")), /http/);
  assert.equal(validateSetting("apiBase", "https://api.diting.cc/"), undefined, "结尾斜杠由清洗负责，不该拦");
  assert.equal(validateSetting("apiBase", "http://localhost:8080"), undefined);
});

test("校验：章节间隔填负数或乱码会被拒绝", () => {
  assert.match(String(validateSetting("sectionMinutes", "-1")), /0 或更大/);
  assert.match(String(validateSetting("sectionMinutes", "abc")), /0 或更大/);
  assert.equal(validateSetting("sectionMinutes", ""), undefined, "留空是合法的，回退默认值");
  assert.equal(validateSetting("sectionMinutes", "0"), undefined);
});

test("校验：其余设置项不做拦截（不替用户猜）", () => {
  assert.equal(validateSetting("apiKey", "随便填"), undefined);
  assert.equal(validateSetting("targetFolder", "/任意/路径"), undefined);
});

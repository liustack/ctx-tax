#!/usr/bin/env node
// ctx-tax: measure the context your agent pays for before you say a word.
// Zero dependencies. Same ruler for everything: ascii chars / 4 + CJK chars.

const fs = require("fs");
const os = require("os");
const path = require("path");

const WINDOW = 200_000;
const CJK = /[　-ヿ㐀-鿿豈-﫿＀-￯]/g;

function tokens(text) {
  const cjk = (text.match(CJK) || []).length;
  return Math.round((text.length - cjk) / 4 + cjk);
}

function readIf(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function frontmatterDescription(text) {
  const m = text.match(/^description:[ \t]*(.+)$/m);
  return m ? m[1].trim() : "";
}

// A locale twin never loads alongside its original, so it does not count
// toward a skill's max. Matches *.zh-CN.md, *.zh.md, *.ja.md and friends.
function isLocaleTwin(name) {
  return /\.[a-z]{2}(-[A-Za-z]{2,4})?\.md$/i.test(name) && name !== "SKILL.md";
}

function mdFilesUnder(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", ".git"].includes(e.name)) stack.push(p);
      } else if (e.name.endsWith(".md")) {
        out.push(p);
      }
    }
  }
  return out;
}

function collectSkills(roots) {
  // One harness loads one copy of a name, so a skill present in several
  // roots (or symlinked between them) counts once. Roots are ordered by
  // priority: earlier wins.
  const seen = new Set();
  const skills = [];
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const dir = path.join(root, e.name);
      let real;
      try {
        real = fs.realpathSync(dir);
      } catch {
        continue;
      }
      if (seen.has(real) || seen.has(e.name)) continue;
      seen.add(e.name);
      const skillMd = path.join(real, "SKILL.md");
      const body = readIf(skillMd);
      if (body === null) continue;
      seen.add(real);
      const description = frontmatterDescription(body);
      let refTokens = 0;
      for (const f of mdFilesUnder(real)) {
        const base = path.basename(f);
        if (path.resolve(f) === path.resolve(skillMd)) continue;
        if (isLocaleTwin(base)) continue;
        const t = readIf(f);
        if (t !== null) refTokens += tokens(t);
      }
      skills.push({
        name: e.name,
        desc: tokens(description),
        body: tokens(body),
        max: tokens(body) + refTokens,
      });
    }
  }
  return skills;
}

function collectMemory(cwd, home) {
  const rows = [];
  const candidates = [
    ["~/.claude/CLAUDE.md", path.join(home, ".claude", "CLAUDE.md")],
    ["./CLAUDE.md", path.join(cwd, "CLAUDE.md")],
    ["./AGENTS.md", path.join(cwd, "AGENTS.md")],
  ];
  for (const [label, p] of candidates) {
    const t = readIf(p);
    if (t !== null) rows.push([label, tokens(t)]);
  }
  for (const rulesDir of [path.join(home, ".claude", "rules"), path.join(cwd, ".claude", "rules")]) {
    let total = 0;
    let n = 0;
    for (const f of mdFilesUnder(rulesDir)) {
      const t = readIf(f);
      if (t !== null) {
        total += tokens(t);
        n += 1;
      }
    }
    if (n) rows.push([`${rulesDir.startsWith(home) ? "~" : "."}/.claude/rules (${n} files)`, total]);
  }
  return rows;
}

function detectSessionHooks(cwd, home) {
  const found = [];
  for (const [label, p] of [
    ["~/.claude/settings.json", path.join(home, ".claude", "settings.json")],
    ["./.claude/settings.json", path.join(cwd, ".claude", "settings.json")],
  ]) {
    const t = readIf(p);
    if (!t) continue;
    try {
      const cfg = JSON.parse(t);
      if (cfg.hooks && cfg.hooks.SessionStart) found.push(label);
    } catch {
      /* unparseable settings are someone else's problem */
    }
  }
  return found;
}

function fmt(n) {
  return n.toLocaleString("en-US");
}

function main() {
  const asJson = process.argv.includes("--json");
  const home = os.homedir();
  const cwd = process.cwd();
  const skills = collectSkills([
    path.join(cwd, ".claude", "skills"),
    path.join(home, ".claude", "skills"),
    path.join(home, ".agents", "skills"),
  ]);
  const memory = collectMemory(cwd, home);
  const hooks = detectSessionHooks(cwd, home);

  const descTotal = skills.reduce((a, s) => a + s.desc, 0);
  const memTotal = memory.reduce((a, [, t]) => a + t, 0);
  const alwaysOn = descTotal + memTotal;

  if (asJson) {
    console.log(JSON.stringify({ skills, memory: Object.fromEntries(memory), hooks, alwaysOn }, null, 2));
    return;
  }

  console.log("\nEvery session, before your first word:\n");
  console.log(`  skill descriptions (${skills.length} skills)`.padEnd(44) + fmt(descTotal).padStart(8));
  for (const [label, t] of memory) {
    console.log(`  ${label}`.padEnd(44) + fmt(t).padStart(8));
  }
  for (const h of hooks) {
    console.log(`  SessionStart hook in ${h}`.padEnd(44) + "  +? (injects unmeasured extra context)");
  }
  console.log("  " + "─".repeat(50));
  const pct = ((alwaysOn / WINDOW) * 100).toFixed(1);
  console.log(`  always-on total`.padEnd(44) + fmt(alwaysOn).padStart(8) + `  = ${pct}% of a 200k window\n`);

  const top = [...skills].sort((a, b) => b.max - a.max).slice(0, 15);
  if (top.length) {
    console.log("When a skill fires (top by max):\n");
    console.log("  skill".padEnd(36) + "on trigger".padStart(12) + "max w/ references".padStart(20));
    for (const s of top) {
      console.log(`  ${s.name}`.padEnd(36) + fmt(s.body).padStart(12) + fmt(s.max).padStart(20));
    }
    if (skills.length > top.length) console.log(`  ... and ${skills.length - top.length} more`);
    console.log();
  }

  console.log("Ruler: ascii/4 + CJK chars, identical for everything. Locale twins excluded from max.");
  console.log("npx @liustack/ctx-tax · by liustack · github.com/liustack/ctx-tax\n");
}

main();

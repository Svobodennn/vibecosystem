var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/mcp-discovery.ts
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var MCP_MAPPINGS = [
  {
    name: "browser-use",
    signals: ["next.config.js", "next.config.ts", "next.config.mjs", "vite.config.ts", "vite.config.js"],
    description: "Frontend debug & browser automation",
    install: "pip3 install --user --break-system-packages browser-use"
  },
  {
    name: "github",
    signals: [".github"],
    description: "GitHub API - repos, issues, PRs",
    install: "npx -y @modelcontextprotocol/server-github"
  },
  {
    name: "docker",
    signals: ["docker-compose.yml", "docker-compose.yaml"],
    description: "Docker container management",
    install: "npx -y @modelcontextprotocol/server-docker"
  },
  {
    name: "postgres",
    signals: ["schema.prisma", "migrations"],
    description: "PostgreSQL database access",
    install: "npx -y @modelcontextprotocol/server-postgres"
  },
  {
    name: "kubernetes",
    signals: ["k8s", "kubernetes", "kustomization.yaml"],
    description: "Kubernetes cluster management",
    install: "npx -y @modelcontextprotocol/server-kubernetes"
  },
  {
    name: "codebase-memory",
    signals: ["docs", "documentation"],
    description: "Codebase indexing & semantic search",
    install: "Zaten kurulu: ~/bin/codebase-memory-mcp"
  },
  {
    name: "sqlite",
    signals: [],
    description: "SQLite database access",
    install: "npx -y @modelcontextprotocol/server-sqlite"
  },
  {
    name: "puppeteer",
    signals: ["playwright.config.ts", "playwright.config.js", "cypress.config.ts", "cypress.config.js"],
    description: "Browser automation & testing",
    install: "npx -y @modelcontextprotocol/server-puppeteer"
  }
];
var STATE_FILE = join(homedir(), ".claude", "cache", "mcp-discovery-fired.json");
function hasAlreadyFired(sessionId) {
  if (!existsSync(STATE_FILE)) return false;
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    return state.session === sessionId;
  } catch {
    return false;
  }
}
function markFired(sessionId) {
  const cacheDir = join(homedir(), ".claude", "cache");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const { writeFileSync } = __require("fs");
  writeFileSync(STATE_FILE, JSON.stringify({ session: sessionId, ts: (/* @__PURE__ */ new Date()).toISOString() }));
}
function getInstalledMcps() {
  const mcpConfigPath = join(homedir(), ".mcp.json");
  if (!existsSync(mcpConfigPath)) return /* @__PURE__ */ new Set();
  try {
    const config = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
    return new Set(Object.keys(config.mcpServers || {}));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function discoverMcps(projectDir) {
  const found = [];
  const installed = getInstalledMcps();
  for (const mapping of MCP_MAPPINGS) {
    if (installed.has(mapping.name)) continue;
    for (const signal of mapping.signals) {
      const checkPath = join(projectDir, signal);
      if (existsSync(checkPath)) {
        found.push(mapping);
        break;
      }
    }
  }
  if (!installed.has("postgres")) {
    try {
      const { readdirSync } = __require("fs");
      const files = readdirSync(projectDir);
      if (files.some((f) => f.endsWith(".sql"))) {
        const pgMapping = MCP_MAPPINGS.find((m) => m.name === "postgres");
        if (pgMapping && !found.includes(pgMapping)) {
          found.push(pgMapping);
        }
      }
    } catch {
    }
  }
  if (!installed.has("sqlite")) {
    try {
      const { readdirSync } = __require("fs");
      const files = readdirSync(projectDir);
      if (files.some((f) => f.endsWith(".db") || f.endsWith(".sqlite"))) {
        const sqliteMapping = MCP_MAPPINGS.find((m) => m.name === "sqlite");
        if (sqliteMapping && !found.includes(sqliteMapping)) {
          found.push(sqliteMapping);
        }
      }
    } catch {
    }
  }
  return found;
}
function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    return;
  }
  if (!raw) {
    console.log("{}");
    return;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    console.log("{}");
    return;
  }
  if (input.tool_name !== "Read") {
    console.log("{}");
    return;
  }
  const sessionId = input.session_id || "unknown";
  if (hasAlreadyFired(sessionId)) {
    console.log("{}");
    return;
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const recommendations = discoverMcps(projectDir);
  if (recommendations.length === 0) {
    markFired(sessionId);
    console.log("{}");
    return;
  }
  markFired(sessionId);
  const lines = [
    "",
    "--- MCP Auto-Discovery ---",
    `Proje: ${projectDir}`,
    "",
    "Bu proje icin faydali olabilecek MCP server'lar:",
    ""
  ];
  for (const rec of recommendations) {
    lines.push(`  * ${rec.name}: ${rec.description}`);
    lines.push(`    Kurulum: ${rec.install}`);
    lines.push("");
  }
  lines.push("~/.mcp.json dosyasina ekleyerek aktive edebilirsiniz.");
  lines.push("---");
  console.log(JSON.stringify({
    result: "continue",
    systemMessage: lines.join("\n")
  }));
}
main();

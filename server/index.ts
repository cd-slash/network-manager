import { createServer, type IncomingMessage } from "node:http";
import { createWsServer } from "tinybase/synchronizers/synchronizer-ws-server";
import { createMergeableStore } from "tinybase";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";
import { WebSocketServer, WebSocket } from "ws";
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { getServerStats } from "./lib/stats";
import { execSSH } from "./lib/ssh";
import { parseUsageOutput } from "./lib/usage";

const PORT = 8048;

// TinyBase WebSocket sync
const wss = new WebSocketServer({ noServer: true });
const wsServer = createWsServer(wss);

// Server-side MergeableStore that participates in sync
const store = createMergeableStore();

wsServer.addClientIdsListener(null, () => {
  const stats = wsServer.getStats();
  console.log(`[sync] paths: ${stats.paths ?? 0}, clients: ${stats.clients ?? 0}`);
});

// Connect server store to sync after server starts
let serverSynchronizer: Awaited<ReturnType<typeof createWsSynchronizer>> | null = null;
const SYNC_PATH = "/sync";

async function connectServerStore() {
  const ws = new WebSocket(`ws://localhost:${PORT}${SYNC_PATH}`);

  ws.on("open", () => console.log("[sync] WebSocket connected to", SYNC_PATH));
  ws.on("close", () => console.log("[sync] WebSocket closed"));
  ws.on("error", (err) => console.log("[sync] WebSocket error:", err.message));

  serverSynchronizer = await createWsSynchronizer(
    store,
    ws,
    1
  );
  await serverSynchronizer.startSync();
  console.log("[sync] Server store connected to sync on path:", SYNC_PATH);

  // Add example tasks if store is empty
  if (store.getRowIds("tasks").length === 0) {
    console.log("[init] Adding example tasks");
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const hourAgo = now - 60 * 60 * 1000;
    const minuteAgo = now - 60 * 1000;

    store.setRow("tasks", "task-1", {
      phaseId: "phase-1",
      type: "feature",
      title: "Implement user authentication",
      description: "Add OAuth2 login with Google and GitHub providers",
      prompt: "Implement secure authentication flow with OAuth2",
      dependsOn: "[]",
      status: "completed",
      containerId: "",
      agentId: "agent-1",
      prUrl: "https://github.com/example/repo/pull/42",
      prNumber: 42,
      reviewSummary: "Great implementation, minor styling suggestions",
      createdAt: dayAgo,
      startedAt: dayAgo + 5 * 60 * 1000,
      completedAt: dayAgo + 2 * 60 * 60 * 1000,
    });

    store.setRow("tasks", "task-2", {
      phaseId: "phase-1",
      type: "feature",
      title: "Add user profile management",
      description: "Create profile CRUD operations with avatar upload",
      prompt: "Build profile management endpoints and UI",
      dependsOn: '["task-1"]',
      status: "implementing",
      containerId: "",
      agentId: "agent-2",
      prUrl: "",
      prNumber: 0,
      reviewSummary: "",
      createdAt: hourAgo,
      startedAt: hourAgo + 10 * 60 * 1000,
      completedAt: 0,
    });

    store.setRow("tasks", "task-3", {
      phaseId: "phase-1",
      type: "bug",
      title: "Fix session timeout issue",
      description: "Users being logged out unexpectedly after 30 minutes",
      prompt: "Debug and fix session persistence problem",
      dependsOn: "[]",
      status: "pending",
      containerId: "",
      agentId: "",
      prUrl: "",
      prNumber: 0,
      reviewSummary: "",
      createdAt: minuteAgo,
      startedAt: 0,
      completedAt: 0,
    });

    store.setRow("tasks", "task-4", {
      phaseId: "phase-2",
      type: "refactor",
      title: "Optimize database queries",
      description: "Reduce N+1 queries in user listing endpoint",
      prompt: "Implement eager loading and query optimization",
      dependsOn: "[]",
      status: "reviewing",
      containerId: "",
      agentId: "agent-1",
      prUrl: "https://github.com/example/repo/pull/45",
      prNumber: 45,
      reviewSummary: "Performance improved by 60%, awaiting merge",
      createdAt: dayAgo + 12 * 60 * 60 * 1000,
      startedAt: dayAgo + 13 * 60 * 60 * 1000,
      completedAt: dayAgo + 15 * 60 * 60 * 1000,
    });

    store.setRow("tasks", "task-5", {
      phaseId: "phase-2",
      type: "test",
      title: "Add integration tests for auth",
      description: "Cover login, logout, and session management flows",
      prompt: "Write comprehensive integration tests",
      dependsOn: '["task-1"]',
      status: "ready",
      containerId: "",
      agentId: "agent-3",
      prUrl: "https://github.com/example/repo/pull/46",
      prNumber: 46,
      reviewSummary: "Tests passing, ready for review",
      createdAt: dayAgo + 6 * 60 * 60 * 1000,
      startedAt: dayAgo + 7 * 60 * 60 * 1000,
      completedAt: dayAgo + 10 * 60 * 60 * 1000,
    });

    store.setRow("tasks", "task-6", {
      phaseId: "phase-3",
      type: "docs",
      title: "Update API documentation",
      description: "Document new authentication endpoints",
      prompt: "Update OpenAPI spec with auth routes",
      dependsOn: '["task-1"]',
      status: "approved",
      containerId: "",
      agentId: "agent-2",
      prUrl: "https://github.com/example/repo/pull/48",
      prNumber: 48,
      reviewSummary: "Documentation complete and accurate",
      createdAt: dayAgo + 18 * 60 * 60 * 1000,
      startedAt: dayAgo + 19 * 60 * 60 * 1000,
      completedAt: dayAgo + 20 * 60 * 60 * 1000,
    });

    store.setRow("phases", "phase-1", {
      projectId: "project-1",
      name: "Authentication & Profiles",
      order: 1,
      status: "in_progress",
      startedAt: dayAgo,
      completedAt: 0,
    });

    store.setRow("phases", "phase-2", {
      projectId: "project-1",
      name: "Performance & Testing",
      order: 2,
      status: "pending",
      startedAt: 0,
      completedAt: 0,
    });

    store.setRow("phases", "phase-3", {
      projectId: "project-1",
      name: "Documentation & Polish",
      order: 3,
      status: "pending",
      startedAt: 0,
      completedAt: 0,
    });

    store.setRow("projects", "project-1", {
      name: "User Management System",
      objective: "Build complete user authentication and management system",
      scope: "{}",
      status: "in_progress",
      repoUrl: "https://github.com/example/repo",
      createdAt: dayAgo - 24 * 60 * 60 * 1000,
    });

    store.setRow("agents", "agent-1", {
      containerId: "",
      containerHostname: "",
      type: "claude",
      status: "idle",
      skipPermissions: true,
      currentPrompt: "",
      lastOutput: "Implementation complete, PR submitted",
      outputLog: "[]",
      tokensUsed: 45230,
      messagesCount: 142,
      costEstimate: 0.89,
      startedAt: dayAgo + 5 * 60 * 1000,
      completedAt: dayAgo + 2 * 60 * 60 * 1000,
      lastActivity: dayAgo + 2 * 60 * 60 * 1000,
    });

    store.setRow("agents", "agent-2", {
      containerId: "",
      containerHostname: "",
      type: "gemini",
      status: "working",
      skipPermissions: true,
      currentPrompt: "Build profile management endpoints and UI",
      lastOutput: "Creating profile controller...",
      outputLog: "[]",
      tokensUsed: 18750,
      messagesCount: 68,
      costEstimate: 0.35,
      startedAt: hourAgo + 10 * 60 * 1000,
      completedAt: 0,
      lastActivity: now - 30 * 1000,
    });

    store.setRow("agents", "agent-3", {
      containerId: "",
      containerHostname: "",
      type: "codex",
      status: "idle",
      skipPermissions: true,
      currentPrompt: "",
      lastOutput: "Tests completed successfully",
      outputLog: "[]",
      tokensUsed: 12450,
      messagesCount: 45,
      costEstimate: 0.18,
      startedAt: dayAgo + 7 * 60 * 60 * 1000,
      completedAt: dayAgo + 10 * 60 * 60 * 1000,
      lastActivity: dayAgo + 10 * 60 * 60 * 1000,
    });

    console.log("[init] Added 6 example tasks, 3 phases, 1 project, and 3 agents");
  }

  // Log store changes
  store.addRowListener("servers", null, (store, tableId, rowId) => {
    console.log(`[store] Row changed: ${tableId}/${rowId}`, store.getRow(tableId, rowId));
  });
}

// Tailscale API
// Note: The public API does not provide an `online` field
// We infer connection status from `lastSeen` timestamp
interface TailscaleDevice {
  id: string;
  hostname: string;
  name: string;
  addresses: string[];
  tags?: string[];
  lastSeen: string;
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isDeviceOnline(lastSeen: string): boolean {
  const lastSeenTime = new Date(lastSeen).getTime();
  const now = Date.now();
  return now - lastSeenTime < ONLINE_THRESHOLD_MS;
}

async function fetchTailscaleDevices(tailnetId: string, apiKey: string) {
  const url = `https://api.tailscale.com/api/v2/tailnet/${tailnetId}/devices`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tailscale API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log("[tailscale] Raw API response sample:", JSON.stringify(data.devices?.[0], null, 2));
  return data.devices as TailscaleDevice[];
}

// Elysia API routes
const api = new Elysia()
  .use(cors())
  .post(
    "/api/tailscale/devices",
    async ({ body }) => {
      const devices = await fetchTailscaleDevices(body.tailnetId, body.apiKey);
      const tag = body.serverTag || "tag:server";
      const servers = devices.filter((d) => d.tags?.includes(tag));

      return {
        servers: servers.map((d) => ({
          tailscaleId: d.id,
          hostname: d.hostname,
          name: d.name,
          tailscaleIp: d.addresses.find((a) => a.startsWith("100.")) || d.addresses[0],
          tags: d.tags || [],
          online: isDeviceOnline(d.lastSeen),
          lastSeen: d.lastSeen,
        })),
      };
    },
    {
      body: t.Object({
        tailnetId: t.String(),
        apiKey: t.String(),
        serverTag: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/api/servers/stats",
    async ({ body }) => {
      return await getServerStats(body);
    },
    {
      body: t.Object({
        host: t.String(),
        user: t.Optional(t.String()),
        port: t.Optional(t.Number()),
      }),
    }
  )
  .post(
    "/api/servers/:id/refresh",
    async ({ params, body }) => {
      const { id } = params;
      const { host, user } = body;

      console.log(`[refresh] Starting refresh for ${id} at ${host}`);
      console.log(`[refresh] Current row before:`, store.getRow("servers", id));

      const stats = await getServerStats({ host, user: user || "root" });

      if (stats.error) {
        console.log(`[refresh] Error for ${id}: ${stats.error}`);
        store.setPartialRow("servers", id, {
          status: "offline",
          lastHealthCheck: Date.now(),
        });
        return { success: false, error: stats.error };
      }

      const updates: Record<string, string | number | boolean> = {
        status: "online",
        lastHealthCheck: Date.now(),
      };

      if (stats.uptime) {
        updates.cpuLoad = stats.uptime.load_1m || 0;
      }

      if (stats.memory) {
        updates.memoryTotal = (stats.memory.mem_total || 0) * 1024 * 1024;
        updates.memoryAvailable = (stats.memory.mem_available || 0) * 1024 * 1024;
      }

      console.log(`[refresh] Applying updates:`, updates);
      store.setPartialRow("servers", id, updates);
      console.log(`[refresh] Store row after update:`, store.getRow("servers", id));
      console.log(`[refresh] All server IDs in store:`, store.getRowIds("servers"));
      return { success: true, stats };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        host: t.String(),
        user: t.Optional(t.String()),
      }),
    }
  )
  .get("/api/debug/store", () => {
    const serverIds = store.getRowIds("servers");
    const servers: Record<string, unknown> = {};
    for (const id of serverIds) {
      servers[id] = store.getRow("servers", id);
    }
    return {
      serverCount: serverIds.length,
      servers,
      syncStats: wsServer.getStats(),
    };
  })
  .get("/api/agents/usage", async () => {
    const AGENT_CONTROL_HOST = "agent-control";

    try {
      // Install ccusage if not present, then run the command
      // ccusage is not installed by default in the container
      const result = await execSSH(
        { host: AGENT_CONTROL_HOST, user: "root" },
        "command -v ccusage >/dev/null 2>&1 || bun i -g ccusage >/dev/null 2>&1; ccusage daily --json",
        60000 // Allow more time for potential installation
      );

      if (result.code !== 0) {
        return {
          success: false,
          error: `Command failed with exit code ${result.code}`,
          stderr: result.stderr,
          usage: null,
        };
      }

      const usage = parseUsageOutput(result.stdout);

      return {
        success: true,
        usage,
        error: usage.error || null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message.includes("timeout")) {
        return {
          success: false,
          error: "Connection timed out",
          usage: null,
        };
      }

      return {
        success: false,
        error: message,
        usage: null,
      };
    }
  });

// Convert Node request to Web Request
function toWebRequest(req: IncomingMessage, body: string): Request {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  return new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
  });
}

// HTTP server with WebSocket upgrade support
const server = createServer(async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const webRequest = toWebRequest(req, body);
      const response = await api.handle(webRequest);

      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }));
    }
  });
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`  WebSocket (TinyBase sync): ws://localhost:${PORT}`);
  console.log(`  HTTP API: http://localhost:${PORT}/api/*`);

  // Connect server store to sync mesh
  connectServerStore().catch(console.error);
});

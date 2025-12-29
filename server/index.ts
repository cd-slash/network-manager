import { createServer, type IncomingMessage } from "node:http";
import { createWsServer } from "tinybase/synchronizers/synchronizer-ws-server";
import { createMergeableStore } from "tinybase";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";
import { WebSocketServer, WebSocket } from "ws";
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import {
  execOpenWRT,
  getSystemInfo,
  getResourceUsage,
  pingDevice,
} from "./lib/openwrt/ssh-commands";
import { ChangeQueueService } from "./lib/openwrt/change-queue";

const PORT = 8048;

// TinyBase WebSocket sync
const wss = new WebSocketServer({ noServer: true });
const wsServer = createWsServer(wss);

// Server-side MergeableStore that participates in sync
const store = createMergeableStore();

// Change queue service
let changeQueue: ChangeQueueService;

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

  serverSynchronizer = await createWsSynchronizer(store, ws, 1);
  await serverSynchronizer.startSync();
  console.log("[sync] Server store connected to sync on path:", SYNC_PATH);

  // Initialize change queue service
  changeQueue = new ChangeQueueService(store as unknown as import("tinybase").MergeableStore);

  // Log store changes for debugging
  store.addRowListener("openwrtDevices", null, (store, tableId, rowId) => {
    console.log(`[store] Row changed: ${tableId}/${rowId}`, store.getRow(tableId, rowId));
  });
}

// Tailscale API
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
  return data.devices as TailscaleDevice[];
}

// Elysia API routes
const api = new Elysia()
  .use(cors())

  // ============================================
  // OpenWRT Device Discovery & Management
  // ============================================

  .post(
    "/api/openwrt/discover",
    async ({ body }) => {
      const devices = await fetchTailscaleDevices(body.tailnetId, body.apiKey);
      const tag = body.openwrtTag || "tag:openwrt";
      const routers = devices.filter((d) => d.tags?.includes(tag));

      return {
        devices: routers.map((d) => ({
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
        openwrtTag: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/api/openwrt/devices/:id/connect",
    async ({ params, body }) => {
      const { id } = params;
      const { host } = body;

      try {
        // Verify SSH connectivity
        const reachable = await pingDevice({ host, user: "root" });
        if (!reachable) {
          return { success: false, error: "Device not reachable via SSH" };
        }

        // Get system information
        const systemInfo = await getSystemInfo({ host, user: "root" });

        // Get resource usage
        const resources = await getResourceUsage({ host, user: "root" });

        // Update store with device info
        store.setPartialRow("openwrtDevices", id, {
          model: systemInfo.model,
          firmwareVersion: systemInfo.firmwareVersion,
          kernelVersion: systemInfo.kernelVersion,
          architecture: systemInfo.architecture,
          uptime: resources.uptime,
          memoryTotal: resources.memoryTotal,
          memoryFree: resources.memoryFree,
          memoryAvailable: resources.memoryAvailable,
          loadAvg1m: resources.loadAvg1m,
          loadAvg5m: resources.loadAvg5m,
          loadAvg15m: resources.loadAvg15m,
          status: "online",
          lastSeen: Date.now(),
        });

        return {
          success: true,
          systemInfo,
          resources,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        host: t.String(),
      }),
    }
  )

  .post(
    "/api/openwrt/devices/:id/sync",
    async ({ params, body }) => {
      const { id } = params;
      const { host } = body;

      try {
        const config = { host, user: "root" };

        // Sync network configuration
        const networkResult = await execOpenWRT(config, "uci show network");
        // TODO: Parse and store network interfaces

        // Sync wireless configuration
        const wirelessResult = await execOpenWRT(config, "uci show wireless");
        // TODO: Parse and store wireless networks

        // Sync firewall configuration
        const firewallResult = await execOpenWRT(config, "uci show firewall");
        // TODO: Parse and store firewall rules

        // Sync DHCP configuration
        const dhcpResult = await execOpenWRT(config, "cat /tmp/dhcp.leases");
        // TODO: Parse and store DHCP leases

        store.setPartialRow("openwrtDevices", id, {
          lastConfigSync: Date.now(),
        });

        return {
          success: true,
          syncedTables: ["network", "wireless", "firewall", "dhcp"],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        host: t.String(),
      }),
    }
  )

  .get(
    "/api/openwrt/devices/:id/status",
    async ({ params, query }) => {
      const { id } = params;
      const host = query.host;

      if (!host) {
        return { success: false, error: "Host parameter required" };
      }

      try {
        const resources = await getResourceUsage({ host, user: "root" });

        // Get conntrack usage
        const conntrackResult = await execOpenWRT(
          { host, user: "root" },
          "cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null; echo ' '; cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null"
        );

        let conntrackCount = 0;
        let conntrackMax = 0;
        if (conntrackResult.code === 0) {
          const parts = conntrackResult.stdout.trim().split(/\s+/);
          conntrackCount = parseInt(parts[0], 10) || 0;
          conntrackMax = parseInt(parts[1], 10) || 0;
        }

        // Update store
        store.setPartialRow("openwrtDevices", id, {
          uptime: resources.uptime,
          memoryTotal: resources.memoryTotal,
          memoryFree: resources.memoryFree,
          loadAvg1m: resources.loadAvg1m,
          loadAvg5m: resources.loadAvg5m,
          loadAvg15m: resources.loadAvg15m,
          status: "online",
          lastSeen: Date.now(),
        });

        return {
          online: true,
          uptime: resources.uptime,
          loadAvg: [resources.loadAvg1m, resources.loadAvg5m, resources.loadAvg15m],
          memoryUsage: {
            total: resources.memoryTotal,
            free: resources.memoryFree,
            available: resources.memoryAvailable,
          },
          conntrackUsage: {
            current: conntrackCount,
            max: conntrackMax,
          },
        };
      } catch (err) {
        store.setPartialRow("openwrtDevices", id, {
          status: "offline",
          lastSeen: Date.now(),
        });

        return {
          online: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ host: t.Optional(t.String()) }),
    }
  )

  // ============================================
  // Approval Queue Endpoints
  // ============================================

  .get("/api/openwrt/changes/pending", ({ query }) => {
    const deviceId = query.deviceId;
    const changes = changeQueue?.getPendingChanges(deviceId) || [];
    return { changes };
  })

  .get("/api/openwrt/changes/history", ({ query }) => {
    const deviceId = query.deviceId;
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const changes = changeQueue?.getChangeHistory(deviceId, limit) || [];
    return { changes };
  })

  .get("/api/openwrt/changes/:id", ({ params }) => {
    const change = store.getRow("pendingChanges", params.id);
    if (!change) {
      return { error: "Change not found" };
    }
    return { change };
  })

  .post(
    "/api/openwrt/changes/:id/approve",
    async ({ params, body }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      const result = await changeQueue.approveChange(
        params.id,
        body.reviewedBy || "admin",
        body.notes
      );

      return result;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        reviewedBy: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/api/openwrt/changes/:id/reject",
    ({ params, body }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      changeQueue.rejectChange(
        params.id,
        body.reviewedBy || "admin",
        body.reason
      );

      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        reviewedBy: t.Optional(t.String()),
        reason: t.String(),
      }),
    }
  )

  .post(
    "/api/openwrt/changes/:id/rollback",
    async ({ params }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      try {
        const rollbackChangeId = await changeQueue.rollbackChange(params.id);
        return { success: true, rollbackChangeId };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  // ============================================
  // Network Management
  // ============================================

  .get("/api/openwrt/devices/:id/network/interfaces", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        "ubus call network.interface dump"
      );

      if (result.code !== 0) {
        return { error: result.stderr };
      }

      const data = JSON.parse(result.stdout);
      return { interfaces: data.interface || [] };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // Wireless Management
  // ============================================

  .get("/api/openwrt/devices/:id/wireless/status", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        "ubus call network.wireless status"
      );

      if (result.code !== 0) {
        return { error: result.stderr };
      }

      return JSON.parse(result.stdout);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  .get("/api/openwrt/devices/:id/wireless/clients", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        "iwinfo | grep -E 'ESSID|Mode|Channel|Signal'"
      );

      return { output: result.stdout };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // DHCP/DNS Management
  // ============================================

  .get("/api/openwrt/devices/:id/dhcp/leases", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        "cat /tmp/dhcp.leases"
      );

      const leases = result.stdout
        .split("\n")
        .filter((l) => l.trim())
        .map((line) => {
          const parts = line.split(/\s+/);
          return {
            expiresAt: parseInt(parts[0], 10) * 1000,
            mac: parts[1],
            ip: parts[2],
            hostname: parts[3] === "*" ? "" : parts[3],
            clientId: parts[4] || "",
          };
        });

      return { leases };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // Package Management
  // ============================================

  .get("/api/openwrt/devices/:id/packages/installed", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        "opkg list-installed"
      );

      const packages = result.stdout
        .split("\n")
        .filter((l) => l.trim())
        .map((line) => {
          const match = line.match(/^(\S+)\s+-\s+(\S+)/);
          if (match) {
            return { name: match[1], version: match[2] };
          }
          return null;
        })
        .filter(Boolean);

      return { packages };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // System Management
  // ============================================

  .get("/api/openwrt/devices/:id/system/logs", async ({ params, query }) => {
    const host = query.host;
    const lines = query.lines ? parseInt(query.lines, 10) : 100;

    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        `logread -l ${lines}`
      );

      return { logs: result.stdout };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  .get("/api/openwrt/devices/:id/system/services", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        "ls -1 /etc/init.d/ | grep -v -E '^\\.'"
      );

      const services = result.stdout.split("\n").filter((s) => s.trim());
      return { services };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // Mesh Network Status
  // ============================================

  .get("/api/openwrt/devices/:id/mesh/status", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      // Check if batman-adv is loaded
      const batmanCheck = await execOpenWRT(
        { host, user: "root" },
        "lsmod | grep -q batman && echo 'yes' || echo 'no'"
      );

      const batmanEnabled = batmanCheck.stdout.trim() === "yes";

      if (!batmanEnabled) {
        return {
          enabled: false,
          protocol: null,
          message: "batman-adv not loaded",
        };
      }

      // Get batman-adv originators
      const originators = await execOpenWRT(
        { host, user: "root" },
        "batctl o 2>/dev/null"
      );

      // Get batman-adv neighbors
      const neighbors = await execOpenWRT(
        { host, user: "root" },
        "batctl n 2>/dev/null"
      );

      return {
        enabled: true,
        protocol: "batman-adv",
        originators: originators.stdout,
        neighbors: neighbors.stdout,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // Debug Endpoint
  // ============================================

  .get("/api/debug/store", () => {
    const deviceIds = store.getRowIds("openwrtDevices");
    const devices: Record<string, unknown> = {};
    for (const id of deviceIds) {
      devices[id] = store.getRow("openwrtDevices", id);
    }

    const pendingIds = store.getRowIds("pendingChanges");
    const pendingCount = pendingIds.filter(
      (id) => store.getCell("pendingChanges", id, "status") === "pending"
    ).length;

    return {
      deviceCount: deviceIds.length,
      devices,
      pendingChanges: pendingCount,
      syncStats: wsServer.getStats(),
    };
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
  console.log(`OpenWRT Manager Server running on http://localhost:${PORT}`);
  console.log(`  WebSocket (TinyBase sync): ws://localhost:${PORT}`);
  console.log(`  HTTP API: http://localhost:${PORT}/api/*`);

  // Connect server store to sync mesh
  connectServerStore().catch(console.error);
});

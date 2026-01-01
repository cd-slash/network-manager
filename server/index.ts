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
import { DeviceService } from "./lib/openwrt/device-service";
import { PollingService } from "./lib/openwrt/polling-service";
import { ExecutionEngine } from "./lib/openwrt/execution-engine";

const PORT = 8048;

// TinyBase WebSocket sync
const wss = new WebSocketServer({ noServer: true });
const wsServer = createWsServer(wss);

// Server-side MergeableStore that participates in sync
const store = createMergeableStore();

// Change queue service
let changeQueue: ChangeQueueService;
let deviceService: DeviceService;
let pollingService: PollingService;
let executionEngine: ExecutionEngine;

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

  // Initialize services
  const mergeableStore = store as unknown as import("tinybase").MergeableStore;
  changeQueue = new ChangeQueueService(mergeableStore);
  deviceService = new DeviceService(mergeableStore);
  pollingService = new PollingService(mergeableStore, {
    pollInterval: 30000, // 30 seconds
    fullRefreshInterval: 300000, // 5 minutes
    pollOnStart: false, // Don't poll immediately, wait for devices to be added
  });
  executionEngine = new ExecutionEngine(mergeableStore);

  // Start polling service
  pollingService.start();
  console.log("[polling] Polling service started");

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

        // Refresh all device data (network, wireless, firewall, etc.) in the background
        if (deviceService) {
          deviceService.refreshAll({ id, host }).catch((err) => {
            console.error(`[connect] Background refresh failed for ${id}:`, err);
          });
        }

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

      if (!deviceService) {
        return { success: false, error: "Device service not initialized" };
      }

      try {
        // Use the device service to do a full refresh of all device data
        await deviceService.refreshAll({ id, host });

        store.setPartialRow("openwrtDevices", id, {
          lastConfigSync: Date.now(),
        });

        return {
          success: true,
          syncedTables: ["network", "wireless", "firewall", "dhcp", "packages", "services"],
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

  .get("/api/openwrt/changes/:id/logs", ({ params }) => {
    if (!changeQueue) {
      return { logs: [] };
    }
    const logs = changeQueue.getExecutionLogs(params.id);
    return { logs };
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
  // VPN Management - WireGuard
  // ============================================

  .get("/api/openwrt/devices/:id/wireguard/status", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      // Check if WireGuard is installed
      const installed = await execOpenWRT(
        { host, user: "root" },
        "opkg list-installed | grep -q wireguard && echo 'yes' || echo 'no'"
      );

      if (installed.stdout.trim() !== "yes") {
        return { installed: false, interfaces: [] };
      }

      // Get all WireGuard status
      const status = await execOpenWRT(
        { host, user: "root" },
        "wg show all dump"
      );

      // Parse the dump output
      const interfaces: Record<string, unknown> = {};
      let currentIface = "";

      for (const line of status.stdout.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\t");

        if (parts.length === 4) {
          // Interface line
          currentIface = line.split("\t")[0] || "wg0";
          interfaces[currentIface] = {
            privateKey: "(hidden)",
            publicKey: parts[1],
            listenPort: parseInt(parts[2], 10) || 0,
            peers: [],
          };
        } else if (parts.length >= 8 && currentIface) {
          // Peer line
          const iface = interfaces[currentIface] as { peers: unknown[] };
          iface.peers.push({
            publicKey: parts[0],
            endpoint: parts[2] !== "(none)" ? parts[2] : "",
            allowedIps: parts[3].split(","),
            latestHandshake: parseInt(parts[4], 10) * 1000 || 0,
            transferRx: parseInt(parts[5], 10) || 0,
            transferTx: parseInt(parts[6], 10) || 0,
            persistentKeepalive: parseInt(parts[7], 10) || 0,
          });
        }
      }

      return { installed: true, interfaces };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  .post(
    "/api/openwrt/devices/:id/wireguard/peers",
    async ({ params, body }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      // Queue the peer addition
      const changeId = changeQueue.queueChange({
        deviceId: params.id,
        changeType: "wireguard_add_peer",
        tableName: "wireguardPeers",
        previousValue: null,
        proposedValue: body,
        description: `Add WireGuard peer ${body.publicKey?.slice(0, 8)}...`,
      });

      return { success: true, changeId };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        interface: t.String(),
        publicKey: t.String(),
        presharedKey: t.Optional(t.String()),
        endpoint: t.Optional(t.String()),
        allowedIps: t.Array(t.String()),
        persistentKeepalive: t.Optional(t.Number()),
      }),
    }
  )

  .delete("/api/openwrt/devices/:id/wireguard/peers/:peerId", async ({ params }) => {
    if (!changeQueue) {
      return { success: false, error: "Change queue not initialized" };
    }

    const peer = store.getRow("wireguardPeers", params.peerId);
    if (!peer) {
      return { success: false, error: "Peer not found" };
    }

    const changeId = changeQueue.queueChange({
      deviceId: params.id,
      changeType: "wireguard_delete_peer",
      tableName: "wireguardPeers",
      rowId: params.peerId,
      previousValue: peer,
      proposedValue: null,
      description: `Delete WireGuard peer`,
    });

    return { success: true, changeId };
  })

  // ============================================
  // VPN Management - OpenVPN
  // ============================================

  .get("/api/openwrt/devices/:id/openvpn/status", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      // Check if OpenVPN is installed
      const installed = await execOpenWRT(
        { host, user: "root" },
        "opkg list-installed | grep -q '^openvpn' && echo 'yes' || echo 'no'"
      );

      if (installed.stdout.trim() !== "yes") {
        return { installed: false, instances: [] };
      }

      // Get OpenVPN instances from UCI
      const config = await execOpenWRT(
        { host, user: "root" },
        "uci show openvpn 2>/dev/null || echo ''"
      );

      // Get running instances
      const running = await execOpenWRT(
        { host, user: "root" },
        "pgrep -la openvpn 2>/dev/null || echo ''"
      );

      const instances: Array<{
        name: string;
        enabled: boolean;
        running: boolean;
        mode: string;
        port: number;
        proto: string;
      }> = [];

      // Parse UCI config
      const instanceNames = new Set<string>();
      for (const line of config.stdout.split("\n")) {
        const match = line.match(/^openvpn\.(\w+)=openvpn/);
        if (match) {
          instanceNames.add(match[1]);
        }
      }

      for (const name of instanceNames) {
        const enabledMatch = config.stdout.match(
          new RegExp(`openvpn\\.${name}\\.enabled='?(\\d)'?`)
        );
        const modeMatch = config.stdout.match(
          new RegExp(`openvpn\\.${name}\\.(client|server)=`)
        );
        const portMatch = config.stdout.match(
          new RegExp(`openvpn\\.${name}\\.port='?(\\d+)'?`)
        );
        const protoMatch = config.stdout.match(
          new RegExp(`openvpn\\.${name}\\.proto='?(\\w+)'?`)
        );

        instances.push({
          name,
          enabled: enabledMatch ? enabledMatch[1] === "1" : false,
          running: running.stdout.includes(name),
          mode: modeMatch ? modeMatch[1] : "client",
          port: portMatch ? parseInt(portMatch[1], 10) : 1194,
          proto: protoMatch ? protoMatch[1] : "udp",
        });
      }

      return { installed: true, instances };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  .post(
    "/api/openwrt/devices/:id/openvpn/:name",
    async ({ params, body }) => {
      const host = body.host;
      if (!host) {
        return { error: "Host parameter required" };
      }

      const action = body.action;
      if (!["start", "stop", "restart"].includes(action)) {
        return { error: "Invalid action" };
      }

      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      const changeId = changeQueue.queueChange({
        deviceId: params.id,
        changeType: `openvpn_${action}`,
        tableName: "openvpnInstances",
        previousValue: { name: params.name },
        proposedValue: { name: params.name, action },
        description: `${action.charAt(0).toUpperCase() + action.slice(1)} OpenVPN instance ${params.name}`,
      });

      return { success: true, changeId };
    },
    {
      params: t.Object({ id: t.String(), name: t.String() }),
      body: t.Object({
        host: t.Optional(t.String()),
        action: t.String(),
      }),
    }
  )

  .post(
    "/api/openwrt/devices/:id/openvpn",
    async ({ params, body }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      const changeId = changeQueue.queueChange({
        deviceId: params.id,
        changeType: "openvpn_create",
        tableName: "openvpnInstances",
        previousValue: null,
        proposedValue: body,
        description: `Create OpenVPN ${body.mode} instance ${body.name}`,
      });

      return { success: true, changeId };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.String(),
        mode: t.String(),
        protocol: t.String(),
        port: t.Number(),
        device: t.String(),
        remote: t.Optional(t.String()),
        cipher: t.Optional(t.String()),
        auth: t.Optional(t.String()),
        ca: t.Optional(t.String()),
        cert: t.Optional(t.String()),
        key: t.Optional(t.String()),
        enabled: t.Boolean(),
      }),
    }
  )

  .delete("/api/openwrt/devices/:id/openvpn/:name", async ({ params }) => {
    if (!changeQueue) {
      return { success: false, error: "Change queue not initialized" };
    }

    const changeId = changeQueue.queueChange({
      deviceId: params.id,
      changeType: "openvpn_delete",
      tableName: "openvpnInstances",
      previousValue: { name: params.name },
      proposedValue: null,
      description: `Delete OpenVPN instance ${params.name}`,
    });

    return { success: true, changeId };
  })

  // ============================================
  // Backup Management
  // ============================================

  .get("/api/openwrt/devices/:id/backups", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    try {
      const result = await execOpenWRT(
        { host, user: "root" },
        "ls -la /tmp/backup-*.tar.gz 2>/dev/null || echo ''"
      );

      const backups: Array<{
        filename: string;
        size: number;
        path: string;
        createdAt: number;
      }> = [];

      for (const line of result.stdout.split("\n")) {
        if (!line.includes("backup-")) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          const path = parts[parts.length - 1];
          const filename = path.split("/").pop() || "";
          // Extract timestamp from filename like backup-20241230-120000.tar.gz
          const match = filename.match(/backup-(\d{8})-(\d{6})/);
          let createdAt = Date.now();
          if (match) {
            const dateStr = match[1];
            const timeStr = match[2];
            createdAt = new Date(
              `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`
            ).getTime();
          }

          backups.push({
            filename,
            size: parseInt(parts[4], 10) || 0,
            path,
            createdAt,
          });
        }
      }

      return { backups };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  .post(
    "/api/openwrt/devices/:id/backups",
    async ({ params, body }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      const changeId = changeQueue.queueChange({
        deviceId: params.id,
        changeType: "backup_create",
        tableName: "configBackups",
        previousValue: null,
        proposedValue: body,
        description: `Create ${body.type} backup${body.description ? `: ${body.description}` : ""}`,
      });

      return { success: true, changeId };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        type: t.String(),
        description: t.Optional(t.String()),
        includePackages: t.Optional(t.Boolean()),
      }),
    }
  )

  .post("/api/openwrt/devices/:id/backups/:backupId/restore", async ({ params }) => {
    if (!changeQueue) {
      return { success: false, error: "Change queue not initialized" };
    }

    const backup = store.getRow("configBackups", params.backupId);
    if (!backup) {
      return { success: false, error: "Backup not found" };
    }

    const changeId = changeQueue.queueChange({
      deviceId: params.id,
      changeType: "backup_restore",
      tableName: "configBackups",
      previousValue: null,
      proposedValue: { backupId: params.backupId, path: backup.path },
      description: `Restore configuration from backup`,
    });

    return { success: true, changeId };
  })

  .delete("/api/openwrt/devices/:id/backups/:backupId", async ({ params, query }) => {
    const host = query.host;
    if (!host) {
      return { error: "Host parameter required" };
    }

    const backup = store.getRow("configBackups", params.backupId);
    if (!backup) {
      return { success: false, error: "Backup not found" };
    }

    try {
      await execOpenWRT(
        { host, user: "root" },
        `rm -f ${backup.path}`
      );

      store.delRow("configBackups", params.backupId);
      return { success: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // System Services Management
  // ============================================

  .post(
    "/api/openwrt/devices/:id/services/:name",
    async ({ params, body }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      const action = body.action;
      if (!["start", "stop", "restart", "enable", "disable"].includes(action)) {
        return { error: "Invalid action" };
      }

      const changeId = changeQueue.queueChange({
        deviceId: params.id,
        changeType: `service_${action}`,
        tableName: "systemServices",
        previousValue: { name: params.name },
        proposedValue: { name: params.name, action },
        description: `${action.charAt(0).toUpperCase() + action.slice(1)} service ${params.name}`,
      });

      return { success: true, changeId };
    },
    {
      params: t.Object({ id: t.String(), name: t.String() }),
      body: t.Object({
        action: t.String(),
      }),
    }
  )

  // ============================================
  // Package Management (Enhanced)
  // ============================================

  .post(
    "/api/openwrt/devices/:id/packages",
    async ({ params, body }) => {
      if (!changeQueue) {
        return { success: false, error: "Change queue not initialized" };
      }

      const action = body.action;
      if (!["install", "upgrade", "remove"].includes(action)) {
        return { error: "Invalid action" };
      }

      const changeId = changeQueue.queueChange({
        deviceId: params.id,
        changeType: `package_${action}`,
        tableName: "packages",
        previousValue: null,
        proposedValue: { package: body.package, action },
        description: `${action.charAt(0).toUpperCase() + action.slice(1)} package ${body.package}`,
      });

      return { success: true, changeId };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        action: t.String(),
        package: t.String(),
      }),
    }
  )

  .delete("/api/openwrt/devices/:id/packages/:name", async ({ params }) => {
    if (!changeQueue) {
      return { success: false, error: "Change queue not initialized" };
    }

    const changeId = changeQueue.queueChange({
      deviceId: params.id,
      changeType: "package_remove",
      tableName: "packages",
      previousValue: { name: params.name },
      proposedValue: null,
      description: `Remove package ${params.name}`,
    });

    return { success: true, changeId };
  })

  .post(
    "/api/openwrt/devices/:id/packages/update",
    async ({ params, body }) => {
      const host = body.host;
      if (!host) {
        return { error: "Host parameter required" };
      }

      try {
        // Run opkg update to refresh package lists on the device
        await execOpenWRT(
          { host, user: "root" },
          "opkg update"
        );

        // Refresh packages in our store (fetch installed + upgradable)
        if (deviceService) {
          await deviceService.refreshPackages({ id: params.id, host });
        }

        return { success: true };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        host: t.String(),
      }),
    }
  )

  // ============================================
  // Logs Management (Enhanced)
  // ============================================

  .post(
    "/api/openwrt/devices/:id/logs/refresh",
    async ({ params, body }) => {
      const host = body.host;
      if (!host) {
        return { error: "Host parameter required" };
      }

      try {
        const result = await execOpenWRT(
          { host, user: "root" },
          "logread -l 500"
        );

        // Parse and store logs
        const logs = result.stdout.split("\n").filter((l) => l.trim());
        let index = 0;

        for (const line of logs) {
          // Parse syslog format: "Mon Dec 30 12:00:00 2024 daemon.info service[123]: message"
          const match = line.match(
            /^(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(\w+)\.(\w+)\s+([^:]+):\s*(.*)$/
          );

          if (match) {
            const logId = `${params.id}-log-${Date.now()}-${index++}`;
            store.setRow("systemLogs", logId, {
              deviceId: params.id,
              timestamp: new Date(match[1]).getTime() || Date.now(),
              facility: match[2],
              severity: match[3],
              process: match[4],
              message: match[5],
            });
          }
        }

        return { success: true, count: index };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        host: t.String(),
      }),
    }
  )

  .delete(
    "/api/openwrt/devices/:id/logs",
    async ({ params, query }) => {
      const host = query.host;
      if (!host) {
        // Just clear local store
        const logIds = store.getRowIds("systemLogs");
        for (const id of logIds) {
          const log = store.getRow("systemLogs", id);
          if (log?.deviceId === params.id) {
            store.delRow("systemLogs", id);
          }
        }
        return { success: true };
      }

      try {
        // Clear logs on device
        await execOpenWRT(
          { host, user: "root" },
          "logread -f &>/dev/null & sleep 0.1; killall logread; > /var/log/messages"
        );

        return { success: true };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ host: t.Optional(t.String()) }),
    }
  )

  // ============================================
  // Change Execution
  // ============================================

  .post(
    "/api/changes/:id/execute",
    async ({ params }) => {
      if (!executionEngine) {
        return { success: false, error: "Execution engine not initialized" };
      }

      try {
        const result = await executionEngine.executeChange(params.id);
        return result;
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  .post(
    "/api/changes/execute-all",
    async ({ body }) => {
      if (!executionEngine) {
        return { success: false, error: "Execution engine not initialized" };
      }

      try {
        const results = await executionEngine.executeApprovedChanges(body.deviceId);
        return {
          success: true,
          results,
          executed: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      body: t.Object({
        deviceId: t.Optional(t.String()),
      }),
    }
  )

  // ============================================
  // Polling Service Control
  // ============================================

  .get("/api/polling/status", () => {
    if (!pollingService) {
      return { error: "Polling service not initialized" };
    }
    return pollingService.getStats();
  })

  .post("/api/polling/start", () => {
    if (!pollingService) {
      return { error: "Polling service not initialized" };
    }
    pollingService.start();
    return { success: true };
  })

  .post("/api/polling/stop", () => {
    if (!pollingService) {
      return { error: "Polling service not initialized" };
    }
    pollingService.stop();
    return { success: true };
  })

  .post(
    "/api/polling/refresh/:deviceId",
    async ({ params }) => {
      if (!pollingService) {
        return { error: "Polling service not initialized" };
      }

      try {
        await pollingService.refreshDevice(params.deviceId);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      params: t.Object({ deviceId: t.String() }),
    }
  )

  .post("/api/polling/poll-all", async () => {
    if (!pollingService) {
      return { error: "Polling service not initialized" };
    }

    try {
      await pollingService.pollAll();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // ============================================
  // Device Service Direct Access
  // ============================================

  .post(
    "/api/openwrt/devices/:id/refresh",
    async ({ params, query }) => {
      if (!deviceService) {
        return { error: "Device service not initialized" };
      }

      const host = query.host;
      if (!host) {
        return { error: "Host parameter required" };
      }

      try {
        await deviceService.refreshAll({
          id: params.id,
          host,
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ host: t.String() }),
    }
  )

  .post(
    "/api/openwrt/devices/:id/execute",
    async ({ params, body, query }) => {
      if (!deviceService) {
        return { error: "Device service not initialized" };
      }

      const host = query.host;
      if (!host) {
        return { error: "Host parameter required" };
      }

      try {
        const result = await deviceService.executeCommand(
          { id: params.id, host },
          body.command
        );
        return result;
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ host: t.String() }),
      body: t.Object({ command: t.String() }),
    }
  )

  // ============================================
  // Speed Benchmarking
  // ============================================

  .post(
    "/api/openwrt/benchmark",
    async ({ body }) => {
      const { sourceDeviceId, targetDeviceId } = body;

      // Get device info
      const sourceDevice = store.getRow("openwrtDevices", sourceDeviceId);
      const targetDevice = store.getRow("openwrtDevices", targetDeviceId);

      if (!sourceDevice || !targetDevice) {
        return { success: false, error: "One or both devices not found" };
      }

      const sourceHost = sourceDevice.tailscaleIp as string;
      const targetHost = targetDevice.tailscaleIp as string;

      if (!sourceHost || !targetHost) {
        return { success: false, error: "Device IPs not available" };
      }

      // Create benchmark record
      const benchmarkId = `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      store.setRow("speedBenchmarks", benchmarkId, {
        id: benchmarkId,
        sourceDeviceId,
        targetDeviceId,
        status: "running",
        downloadSpeed: 0,
        uploadSpeed: 0,
        latency: 0,
        jitter: 0,
        packetLoss: 0,
        startedAt: Date.now(),
        completedAt: 0,
        error: "",
      });

      // Run benchmark asynchronously
      (async () => {
        try {
          // First, run ping test to get latency
          const pingResult = await execOpenWRT(
            { host: sourceHost, user: "root" },
            `ping -c 10 -i 0.2 ${targetHost} 2>&1`,
            30000
          );

          let latency = 0;
          let jitter = 0;
          let packetLoss = 0;

          if (pingResult.code === 0) {
            // Parse ping output for latency stats
            const latencyMatch = pingResult.stdout.match(/min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
            if (latencyMatch) {
              latency = parseFloat(latencyMatch[2]); // avg
              jitter = parseFloat(latencyMatch[4]); // mdev as jitter proxy
            }

            // Parse packet loss
            const lossMatch = pingResult.stdout.match(/(\d+)% packet loss/);
            if (lossMatch) {
              packetLoss = parseFloat(lossMatch[1]);
            }
          }

          // Update with ping results
          store.setPartialRow("speedBenchmarks", benchmarkId, {
            latency,
            jitter,
            packetLoss,
          });

          // Check if iperf3 is available
          const iperfCheck = await execOpenWRT(
            { host: sourceHost, user: "root" },
            "which iperf3 2>/dev/null || which iperf 2>/dev/null || echo 'not found'",
            10000
          );

          let downloadSpeed = 0;
          let uploadSpeed = 0;

          if (!iperfCheck.stdout.includes("not found")) {
            // Start iperf server on target
            await execOpenWRT(
              { host: targetHost, user: "root" },
              "pkill -9 iperf3 2>/dev/null; iperf3 -s -D -1",
              10000
            );

            // Wait a bit for server to start
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Run download test (from target to source)
            const downloadResult = await execOpenWRT(
              { host: sourceHost, user: "root" },
              `iperf3 -c ${targetHost} -t 5 -J 2>&1`,
              60000
            );

            if (downloadResult.code === 0) {
              try {
                const data = JSON.parse(downloadResult.stdout);
                if (data.end?.sum_received?.bits_per_second) {
                  downloadSpeed = data.end.sum_received.bits_per_second / 1000000; // Convert to Mbps
                }
              } catch {
                // Try parsing non-JSON output
                const speedMatch = downloadResult.stdout.match(/([\d.]+)\s+Mbits\/sec/);
                if (speedMatch) {
                  downloadSpeed = parseFloat(speedMatch[1]);
                }
              }
            }

            // Wait for server to restart
            await execOpenWRT(
              { host: targetHost, user: "root" },
              "pkill -9 iperf3 2>/dev/null; iperf3 -s -D -1",
              10000
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Run upload test (from source to target)
            const uploadResult = await execOpenWRT(
              { host: sourceHost, user: "root" },
              `iperf3 -c ${targetHost} -t 5 -R -J 2>&1`,
              60000
            );

            if (uploadResult.code === 0) {
              try {
                const data = JSON.parse(uploadResult.stdout);
                if (data.end?.sum_sent?.bits_per_second) {
                  uploadSpeed = data.end.sum_sent.bits_per_second / 1000000; // Convert to Mbps
                }
              } catch {
                const speedMatch = uploadResult.stdout.match(/([\d.]+)\s+Mbits\/sec/);
                if (speedMatch) {
                  uploadSpeed = parseFloat(speedMatch[1]);
                }
              }
            }

            // Clean up server
            await execOpenWRT(
              { host: targetHost, user: "root" },
              "pkill -9 iperf3 2>/dev/null",
              5000
            );
          }

          // Update with final results
          store.setPartialRow("speedBenchmarks", benchmarkId, {
            status: "completed",
            downloadSpeed,
            uploadSpeed,
            latency,
            jitter,
            packetLoss,
            completedAt: Date.now(),
          });
        } catch (err) {
          store.setPartialRow("speedBenchmarks", benchmarkId, {
            status: "failed",
            completedAt: Date.now(),
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      })();

      return { success: true, benchmarkId };
    },
    {
      body: t.Object({
        sourceDeviceId: t.String(),
        targetDeviceId: t.String(),
      }),
    }
  )

  .get("/api/openwrt/benchmarks", () => {
    const benchmarkIds = store.getRowIds("speedBenchmarks");
    const benchmarks = benchmarkIds.map((id) => store.getRow("speedBenchmarks", id));
    return { benchmarks: benchmarks.sort((a, b) => (b?.startedAt as number || 0) - (a?.startedAt as number || 0)) };
  })

  .get("/api/openwrt/benchmarks/:id", ({ params }) => {
    const benchmark = store.getRow("speedBenchmarks", params.id);
    if (!benchmark) {
      return { error: "Benchmark not found" };
    }
    return { benchmark };
  })

  .delete("/api/openwrt/benchmarks/:id", ({ params }) => {
    store.delRow("speedBenchmarks", params.id);
    return { success: true };
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

    const radioIds = store.getRowIds("wirelessRadios");
    const radios: Record<string, unknown> = {};
    for (const id of radioIds) {
      radios[id] = store.getRow("wirelessRadios", id);
    }

    const networkIds = store.getRowIds("wirelessNetworks");
    const networks: Record<string, unknown> = {};
    for (const id of networkIds) {
      networks[id] = store.getRow("wirelessNetworks", id);
    }

    const clientIds = store.getRowIds("wirelessClients");
    const clients: Record<string, unknown> = {};
    for (const id of clientIds) {
      clients[id] = store.getRow("wirelessClients", id);
    }

    const pendingIds = store.getRowIds("pendingChanges");
    const pendingCount = pendingIds.filter(
      (id) => store.getCell("pendingChanges", id, "status") === "pending"
    ).length;

    return {
      deviceCount: deviceIds.length,
      devices,
      wirelessRadioCount: radioIds.length,
      wirelessRadios: radios,
      wirelessNetworkCount: networkIds.length,
      wirelessNetworks: networks,
      wirelessClientCount: clientIds.length,
      wirelessClients: clients,
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

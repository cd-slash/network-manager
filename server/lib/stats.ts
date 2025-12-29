import { execSSH, type SSHConfig } from "./ssh";

export interface UptimeStats {
  uptime: string;
  uptime_seconds: number;
  users: number;
  load_1m: number;
  load_5m: number;
  load_15m: number;
}

export interface MemoryStats {
  mem_total: number;
  mem_used: number;
  mem_free: number;
  mem_available: number;
  swap_total: number;
  swap_used: number;
  swap_free: number;
}

export interface ServerStats {
  uptime: UptimeStats | null;
  memory: MemoryStats | null;
  error?: string;
}

export async function getServerStats(config: SSHConfig): Promise<ServerStats> {
  const stats: ServerStats = { uptime: null, memory: null };

  const command = `uptime | jc --uptime && echo "---SEPARATOR---" && free -m | jc --free`;

  console.log(`[stats] Getting stats for ${config.host}`);

  try {
    const result = await execSSH(config, command);

    console.log(`[stats] SSH result code: ${result.code}`);

    if (result.code !== 0) {
      console.log(`[stats] SSH failed with stderr: ${result.stderr}`);
      return { ...stats, error: `SSH failed: ${result.stderr}` };
    }

    const [uptimeJson, memoryJson] = result.stdout.split("---SEPARATOR---");
    console.log(`[stats] Split result - uptime part: ${uptimeJson?.length || 0} chars, memory part: ${memoryJson?.length || 0} chars`);

    if (uptimeJson?.trim()) {
      try {
        console.log(`[stats] Parsing uptime JSON:`, uptimeJson.trim().slice(0, 200));
        const parsed = JSON.parse(uptimeJson.trim());
        stats.uptime = {
          uptime: parsed.uptime || "",
          uptime_seconds: parsed.uptime_seconds || 0,
          users: parsed.users || 0,
          load_1m: parsed.load_1m || 0,
          load_5m: parsed.load_5m || 0,
          load_15m: parsed.load_15m || 0,
        };
        console.log(`[stats] Parsed uptime:`, stats.uptime);
      } catch (e) {
        console.log(`[stats] Failed to parse uptime:`, e);
        stats.error = "Failed to parse uptime";
      }
    } else {
      console.log(`[stats] No uptime JSON found`);
    }

    if (memoryJson?.trim()) {
      try {
        console.log(`[stats] Parsing memory JSON:`, memoryJson.trim().slice(0, 200));
        const parsed = JSON.parse(memoryJson.trim());
        const mem = parsed.find((r: { type: string }) => r.type === "Mem") || parsed[0];
        const swap = parsed.find((r: { type: string }) => r.type === "Swap");

        if (mem) {
          stats.memory = {
            mem_total: mem.total || 0,
            mem_used: mem.used || 0,
            mem_free: mem.free || 0,
            mem_available: mem.available || mem.free || 0,
            swap_total: swap?.total || 0,
            swap_used: swap?.used || 0,
            swap_free: swap?.free || 0,
          };
          console.log(`[stats] Parsed memory:`, stats.memory);
        } else {
          console.log(`[stats] No Mem entry found in parsed memory data`);
        }
      } catch (e) {
        console.log(`[stats] Failed to parse memory:`, e);
        stats.error = (stats.error ? stats.error + "; " : "") + "Failed to parse memory";
      }
    } else {
      console.log(`[stats] No memory JSON found`);
    }

    console.log(`[stats] Final stats:`, JSON.stringify(stats));
    return stats;
  } catch (err) {
    console.log(`[stats] Exception:`, err);
    return { ...stats, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

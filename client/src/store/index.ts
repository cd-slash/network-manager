import { createMergeableStore } from "tinybase";

export type ServerStatus = "online" | "busy" | "draining" | "offline";
export type ContainerStatus = "connected" | "disconnected" | "starting" | "error";
export type AgentStatus = "idle" | "working" | "paused" | "error";
export type TaskStatus = "pending" | "spawning" | "implementing" | "reviewing" | "ready" | "approved" | "merging" | "completed";

export interface Server {
  tailscaleId: string;
  hostname: string;
  tailscaleIp: string;
  tags: string;
  status: ServerStatus;
  cpuLoad: number;
  memoryTotal: number;
  memoryAvailable: number;
  containerCapacity: number;
  activeContainers: number;
  lastHealthCheck: number;
  createdAt: number;
}

export const createAppStore = () =>
  createMergeableStore().setTablesSchema({
    settings: {
      key: { type: "string" },
      tailnetId: { type: "string", default: "" },
      apiKey: { type: "string", default: "" },
    },
    servers: {
      tailscaleId: { type: "string" },
      hostname: { type: "string" },
      tailscaleIp: { type: "string" },
      tags: { type: "string", default: "[]" },
      status: { type: "string", default: "offline" },
      cpuLoad: { type: "number", default: 0 },
      memoryTotal: { type: "number", default: 0 },
      memoryAvailable: { type: "number", default: 0 },
      containerCapacity: { type: "number", default: 4 },
      activeContainers: { type: "number", default: 0 },
      lastHealthCheck: { type: "number", default: 0 },
      createdAt: { type: "number" },
    },
    projects: {
      name: { type: "string" },
      objective: { type: "string" },
      scope: { type: "string", default: "{}" },
      status: { type: "string", default: "planning" },
      repoUrl: { type: "string" },
      createdAt: { type: "number" },
    },
    phases: {
      projectId: { type: "string" },
      name: { type: "string" },
      order: { type: "number" },
      status: { type: "string", default: "pending" },
      startedAt: { type: "number" },
      completedAt: { type: "number" },
    },
    tasks: {
      phaseId: { type: "string" },
      type: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      prompt: { type: "string" },
      dependsOn: { type: "string", default: "[]" },
      status: { type: "string", default: "pending" },
      containerId: { type: "string" },
      agentId: { type: "string" },
      prUrl: { type: "string" },
      prNumber: { type: "number" },
      reviewSummary: { type: "string" },
      createdAt: { type: "number" },
      startedAt: { type: "number" },
      completedAt: { type: "number" },
    },
    containers: {
      tailscaleId: { type: "string" },
      hostname: { type: "string" },
      tailscaleIp: { type: "string" },
      tags: { type: "string", default: "[]" },
      repo: { type: "string" },
      branch: { type: "string" },
      projectName: { type: "string" },
      agentType: { type: "string" },
      taskId: { type: "string" },
      status: { type: "string", default: "connected" },
      lastSeen: { type: "number" },
      createdAt: { type: "number" },
    },
    agents: {
      containerId: { type: "string" },
      containerHostname: { type: "string" },
      type: { type: "string" },
      status: { type: "string", default: "idle" },
      skipPermissions: { type: "boolean", default: true },
      currentPrompt: { type: "string" },
      lastOutput: { type: "string" },
      outputLog: { type: "string", default: "[]" },
      tokensUsed: { type: "number", default: 0 },
      messagesCount: { type: "number", default: 0 },
      costEstimate: { type: "number", default: 0 },
      startedAt: { type: "number" },
      completedAt: { type: "number" },
      lastActivity: { type: "number" },
    },
  } as const);

export type AppStore = ReturnType<typeof createAppStore>;

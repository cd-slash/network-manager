import { useCallback, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { useRowIds, useTable } from "tinybase/ui-react";
import {
  Router,
  Wifi,
  Globe,
  Waypoints,
  Server,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DeviceNodeData {
  id: string;
  hostname: string;
  model: string;
  tailscaleIp: string;
  status: string;
  isMeshNode: boolean;
  isGateway: boolean;
  interfaces: string[];
}

interface MeshNodeData {
  deviceId: string;
  protocol: string;
  role: string;
  neighbors: number;
  metric: number;
}

function DeviceNode({ data }: { data: DeviceNodeData }) {
  const isOnline = data.status === "online";
  const IconComponent = data.isGateway ? Globe : data.isMeshNode ? Waypoints : Router;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-background shadow-lg min-w-[180px] ${
        isOnline ? "border-green-500" : "border-muted-foreground/30"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`p-2 rounded-md ${
            isOnline ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
          }`}
        >
          <IconComponent className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{data.hostname}</div>
          <div className="text-xs text-muted-foreground truncate">{data.model}</div>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-2">
        <Badge variant={isOnline ? "success" : "secondary"} className="text-xs">
          {data.status}
        </Badge>
        {data.isMeshNode && (
          <Badge variant="outline" className="text-xs">
            Mesh
          </Badge>
        )}
        {data.isGateway && (
          <Badge variant="outline" className="text-xs text-blue-500">
            Gateway
          </Badge>
        )}
      </div>

      <div className="text-xs text-muted-foreground font-mono">
        {data.tailscaleIp}
      </div>

      {data.interfaces.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.interfaces.slice(0, 3).map((iface) => (
            <span
              key={iface}
              className="text-xs px-1.5 py-0.5 bg-muted rounded"
            >
              {iface}
            </span>
          ))}
          {data.interfaces.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{data.interfaces.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function InternetNode() {
  return (
    <div className="px-4 py-3 rounded-full border-2 border-blue-500 bg-blue-500/10 shadow-lg">
      <div className="flex items-center gap-2">
        <Globe className="h-6 w-6 text-blue-500" />
        <span className="font-semibold text-blue-500">Internet</span>
      </div>
    </div>
  );
}

function ClientsNode({ data }: { data: { count: number; deviceId: string } }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-muted-foreground/30 bg-background shadow">
      <div className="flex items-center gap-2">
        <Wifi className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">
          {data.count} {data.count === 1 ? "Client" : "Clients"}
        </span>
      </div>
    </div>
  );
}

function SwitchNode({ data }: { data: { name: string } }) {
  return (
    <div className="px-3 py-2 rounded border border-muted-foreground/30 bg-muted/50 shadow">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium">{data.name}</span>
      </div>
    </div>
  );
}

const nodeTypes = {
  device: DeviceNode,
  internet: InternetNode,
  clients: ClientsNode,
  switch: SwitchNode,
};

function getEdgeColor(type: string): string {
  switch (type) {
    case "wan":
      return "#3b82f6"; // blue
    case "mesh":
      return "#8b5cf6"; // purple
    case "lan":
      return "#22c55e"; // green
    default:
      return "#6b7280"; // gray
  }
}

export function NetworkTopology() {
  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");
  const meshNodeIds = useRowIds("meshNodes");
  const meshNodesData = useTable("meshNodes");
  const interfaceIds = useRowIds("networkInterfaces");
  const interfacesData = useTable("networkInterfaces");
  const clientIds = useRowIds("wirelessClients");
  const clientsData = useTable("wirelessClients");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const generateTopology = useCallback(() => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Add Internet node at top
    newNodes.push({
      id: "internet",
      type: "internet",
      position: { x: 400, y: 0 },
      data: {},
    });

    // Build device data with mesh info
    const deviceMeshInfo = new Map<string, MeshNodeData>();
    meshNodeIds.forEach((id) => {
      const mesh = meshNodesData[id];
      if (mesh) {
        deviceMeshInfo.set(mesh.deviceId as string, {
          deviceId: mesh.deviceId as string,
          protocol: (mesh.protocol as string) || "802.11s",
          role: (mesh.role as string) || "node",
          neighbors: (mesh.neighbors as number) || 0,
          metric: (mesh.metric as number) || 0,
        });
      }
    });

    // Build interface lists per device
    const deviceInterfaces = new Map<string, string[]>();
    interfaceIds.forEach((id) => {
      const iface = interfacesData[id];
      if (iface) {
        const devId = iface.deviceId as string;
        if (!deviceInterfaces.has(devId)) {
          deviceInterfaces.set(devId, []);
        }
        deviceInterfaces.get(devId)!.push(iface.name as string);
      }
    });

    // Count clients per device
    const deviceClientCounts = new Map<string, number>();
    clientIds.forEach((id) => {
      const client = clientsData[id];
      if (client) {
        const devId = client.deviceId as string;
        deviceClientCounts.set(devId, (deviceClientCounts.get(devId) || 0) + 1);
      }
    });

    // Find gateways (devices with WAN or mesh gateways)
    const gateways: string[] = [];
    deviceIds.forEach((id) => {
      const meshInfo = deviceMeshInfo.get(id);
      if (meshInfo?.role === "gate") {
        gateways.push(id);
      }
    });

    // If no mesh gateways, use first online device as gateway
    if (gateways.length === 0 && deviceIds.length > 0) {
      const firstOnline = deviceIds.find(
        (id) => devicesData[id]?.status === "online"
      );
      if (firstOnline) gateways.push(firstOnline);
    }

    // Position devices
    const gatewayY = 150;
    const nodeY = 350;
    const spacing = 250;

    let gatewayX = 400 - ((gateways.length - 1) * spacing) / 2;
    let nodeX = 400 - ((deviceIds.length - gateways.length - 1) * spacing) / 2;

    deviceIds.forEach((id) => {
      const device = devicesData[id] || {};
      const meshInfo = deviceMeshInfo.get(id);
      const isGateway = gateways.includes(id);
      const interfaces = deviceInterfaces.get(id) || [];

      let x: number, y: number;
      if (isGateway) {
        x = gatewayX;
        y = gatewayY;
        gatewayX += spacing;
      } else {
        x = nodeX;
        y = nodeY;
        nodeX += spacing;
      }

      const nodeData: DeviceNodeData = {
        id,
        hostname: (device.hostname as string) || id,
        model: (device.model as string) || "Unknown",
        tailscaleIp: (device.tailscaleIp as string) || "",
        status: (device.status as string) || "unknown",
        isMeshNode: !!meshInfo,
        isGateway,
        interfaces,
      };

      newNodes.push({
        id,
        type: "device",
        position: { x, y },
        data: nodeData,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });

      // Connect gateways to internet
      if (isGateway) {
        newEdges.push({
          id: `internet-${id}`,
          source: "internet",
          target: id,
          type: "smoothstep",
          animated: device.status === "online",
          style: { stroke: getEdgeColor("wan"), strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: getEdgeColor("wan"),
          },
          label: "WAN",
          labelStyle: { fontSize: 10 },
        });
      }

      // Add client nodes if device has clients
      const clientCount = deviceClientCounts.get(id) || 0;
      if (clientCount > 0) {
        const clientNodeId = `clients-${id}`;
        newNodes.push({
          id: clientNodeId,
          type: "clients",
          position: { x: x + 80, y: y + 120 },
          data: { count: clientCount, deviceId: id },
        });

        newEdges.push({
          id: `${id}-${clientNodeId}`,
          source: id,
          target: clientNodeId,
          type: "smoothstep",
          style: { stroke: getEdgeColor("lan"), strokeWidth: 1.5 },
        });
      }
    });

    // Add mesh connections between devices
    const meshConnections = new Set<string>();
    meshNodeIds.forEach((id) => {
      const mesh = meshNodesData[id];
      if (!mesh) return;

      const sourceDeviceId = mesh.deviceId as string;
      const neighbors = (mesh.neighbors as number) || 0;

      // Connect to other mesh nodes
      if (neighbors > 0) {
        meshNodeIds.forEach((otherId) => {
          if (id === otherId) return;
          const otherMesh = meshNodesData[otherId];
          if (!otherMesh) return;

          const targetDeviceId = otherMesh.deviceId as string;
          if (sourceDeviceId === targetDeviceId) return;

          // Create unique connection key
          const connKey = [sourceDeviceId, targetDeviceId].sort().join("-");
          if (meshConnections.has(connKey)) return;
          meshConnections.add(connKey);

          newEdges.push({
            id: `mesh-${connKey}`,
            source: sourceDeviceId,
            target: targetDeviceId,
            type: "smoothstep",
            animated: true,
            style: {
              stroke: getEdgeColor("mesh"),
              strokeWidth: 2,
              strokeDasharray: "5,5",
            },
            label: mesh.protocol as string,
            labelStyle: { fontSize: 10 },
          });
        });
      }
    });

    // Connect non-gateway devices to gateways if not mesh
    deviceIds.forEach((id) => {
      if (gateways.includes(id)) return;
      const meshInfo = deviceMeshInfo.get(id);
      if (meshInfo) return; // Already connected via mesh

      // Find closest gateway
      if (gateways.length > 0) {
        newEdges.push({
          id: `lan-${gateways[0]}-${id}`,
          source: gateways[0],
          target: id,
          type: "smoothstep",
          style: { stroke: getEdgeColor("lan"), strokeWidth: 1.5 },
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [
    deviceIds,
    devicesData,
    meshNodeIds,
    meshNodesData,
    interfaceIds,
    interfacesData,
    clientIds,
    clientsData,
    setNodes,
    setEdges,
  ]);

  useEffect(() => {
    generateTopology();
  }, [generateTopology]);

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === "internet") return "#3b82f6";
    if (node.type === "clients") return "#6b7280";
    const data = node.data as DeviceNodeData;
    if (data?.status === "online") return "#22c55e";
    return "#6b7280";
  }, []);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0, 0, 0, 0.1)"
          className="bg-background border rounded"
        />
      </ReactFlow>
    </div>
  );
}

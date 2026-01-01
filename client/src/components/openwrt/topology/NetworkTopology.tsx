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
  Smartphone,
  Laptop,
  Tv,
  Monitor,
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

interface ClientNodeData {
  id: string;
  hostname: string;
  macAddress: string;
  ipAddress: string;
  signalStrength: number;
  deviceId: string;
}

function getClientIcon(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower.includes("iphone") || lower.includes("android") || lower.includes("pixel") || lower.includes("galaxy")) {
    return Smartphone;
  }
  if (lower.includes("tv") || lower.includes("roku") || lower.includes("fire") || lower.includes("chromecast")) {
    return Tv;
  }
  if (lower.includes("macbook") || lower.includes("laptop") || lower.includes("thinkpad")) {
    return Laptop;
  }
  if (lower.includes("desktop") || lower.includes("imac") || lower.includes("pc")) {
    return Monitor;
  }
  return Wifi;
}

function getSignalColor(dbm: number): string {
  if (dbm >= -50) return "text-green-500 border-green-500";
  if (dbm >= -70) return "text-yellow-500 border-yellow-500";
  return "text-red-500 border-red-500";
}

function ClientNode({ data }: { data: ClientNodeData }) {
  const IconComponent = getClientIcon(data.hostname);
  const signalColor = data.signalStrength ? getSignalColor(data.signalStrength) : "text-muted-foreground border-muted-foreground/30";
  const displayName = data.hostname || "Unknown";

  return (
    <div className={`px-2 py-1.5 rounded-lg border bg-background shadow-sm min-w-[100px] max-w-[140px] ${signalColor.split(" ")[1]}`}>
      <div className="flex items-center gap-1.5">
        <IconComponent className={`h-3.5 w-3.5 shrink-0 ${signalColor.split(" ")[0]}`} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate">{displayName}</div>
          {data.ipAddress && (
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              {data.ipAddress}
            </div>
          )}
        </div>
      </div>
      {data.signalStrength !== 0 && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {data.signalStrength} dBm
        </div>
      )}
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
  client: ClientNode,
  switch: SwitchNode,
};

// Node dimensions for layout
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  internet: { width: 140, height: 50 },
  device: { width: 200, height: 120 },
  client: { width: 140, height: 60 },
  switch: { width: 100, height: 40 },
};

interface HubSpokeLayoutParams {
  nodes: Node[];
  edges: Edge[];
  gatewayIds: string[];
  deviceClients: Map<string, string[]>; // deviceId -> clientNodeIds
}

function getHubSpokeLayout({ nodes, edges, gatewayIds, deviceClients }: HubSpokeLayoutParams) {
  const positionedNodes: Node[] = [];
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Layout constants
  const VERTICAL_SPACING = 200;
  const DEVICE_RADIUS = 300;       // Radius for non-gateway devices around gateway
  const CLIENT_RADIUS = 180;       // Radius for clients around their parent device
  const MIN_CLIENT_SPACING = 160;  // Minimum spacing between clients

  // Categorize nodes
  const internetNode = nodes.find(n => n.type === "internet");
  const deviceNodes = nodes.filter(n => n.type === "device");
  const nonGatewayDevices = deviceNodes.filter(n => !gatewayIds.includes(n.id));

  // Center point for the layout
  const centerX = 400;

  // 1. Position Internet node at the top center
  if (internetNode) {
    const dims = NODE_DIMENSIONS.internet;
    positionedNodes.push({
      ...internetNode,
      position: { x: centerX - dims.width / 2, y: 0 },
    });
  }

  // 2. Position gateway(s) below Internet - this is the hub
  const gatewayY = VERTICAL_SPACING;
  gatewayIds.forEach((gwId, index) => {
    const node = nodeById.get(gwId);
    if (node) {
      const dims = NODE_DIMENSIONS.device;
      const xOffset = (index - (gatewayIds.length - 1) / 2) * 250;
      positionedNodes.push({
        ...node,
        position: { x: centerX - dims.width / 2 + xOffset, y: gatewayY },
      });
    }
  });

  // 3. Position non-gateway devices in a semicircle below the gateway (spokes)
  const deviceStartAngle = Math.PI * 0.2;  // Start angle (slightly past horizontal)
  const deviceEndAngle = Math.PI * 0.8;    // End angle (slightly before horizontal)
  const deviceY = gatewayY + VERTICAL_SPACING;

  nonGatewayDevices.forEach((node, index) => {
    const dims = NODE_DIMENSIONS.device;
    const count = nonGatewayDevices.length;

    if (count === 1) {
      // Single device goes directly below gateway
      positionedNodes.push({
        ...node,
        position: { x: centerX - dims.width / 2, y: deviceY },
      });
    } else {
      // Spread devices in a semicircle below the gateway
      const angleRange = deviceEndAngle - deviceStartAngle;
      const angle = deviceStartAngle + (index / (count - 1)) * angleRange;
      const x = centerX + Math.cos(angle) * DEVICE_RADIUS - dims.width / 2;
      const y = gatewayY + Math.sin(angle) * DEVICE_RADIUS;

      positionedNodes.push({
        ...node,
        position: { x, y },
      });
    }
  });

  // 4. Position clients around each device in a radial pattern
  const positionedNodeMap = new Map(positionedNodes.map(n => [n.id, n]));

  deviceClients.forEach((clientNodeIds, deviceId) => {
    const parentNode = positionedNodeMap.get(deviceId);
    if (!parentNode || clientNodeIds.length === 0) return;

    const parentDims = NODE_DIMENSIONS.device;
    const parentCenterX = parentNode.position.x + parentDims.width / 2;
    const parentCenterY = parentNode.position.y + parentDims.height / 2;

    const clientCount = clientNodeIds.length;
    const clientDims = NODE_DIMENSIONS.client;

    // Calculate optimal radius based on client count
    const circumference = clientCount * MIN_CLIENT_SPACING;
    const calculatedRadius = Math.max(CLIENT_RADIUS, circumference / (2 * Math.PI));

    // Determine angular range based on node type
    // Gateway clients spread in full circle below, other devices spread outward
    const isGateway = gatewayIds.includes(deviceId);
    let startAngle: number, endAngle: number;

    if (isGateway) {
      // Gateway: clients go below in a semicircle
      startAngle = Math.PI * 0.25;
      endAngle = Math.PI * 0.75;
    } else {
      // Non-gateway: clients spread outward from center
      // Find angle from center to this device
      const angleFromCenter = Math.atan2(
        parentCenterY - (gatewayY + NODE_DIMENSIONS.device.height / 2),
        parentCenterX - centerX
      );
      // Spread clients in an arc facing away from center
      startAngle = angleFromCenter - Math.PI / 3;
      endAngle = angleFromCenter + Math.PI / 3;
    }

    clientNodeIds.forEach((clientNodeId, index) => {
      const clientNode = nodeById.get(clientNodeId);
      if (!clientNode) return;

      let angle: number;
      if (clientCount === 1) {
        angle = (startAngle + endAngle) / 2;
      } else {
        angle = startAngle + (index / (clientCount - 1)) * (endAngle - startAngle);
      }

      const x = parentCenterX + Math.cos(angle) * calculatedRadius - clientDims.width / 2;
      const y = parentCenterY + Math.sin(angle) * calculatedRadius - clientDims.height / 2;

      positionedNodes.push({
        ...clientNode,
        position: { x, y },
      });
    });
  });

  console.log("Hub-spoke layout - positioned nodes:", positionedNodes.length);
  console.log("Gateways:", gatewayIds);
  console.log("Non-gateway devices:", nonGatewayDevices.map(n => n.id));

  return {
    nodes: positionedNodes,
    edges,
  };
}

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
    const layoutEdges: Edge[] = []; // Edges used for dagre layout (hierarchical only)
    const visualEdges: Edge[] = []; // Additional edges for display (mesh connections)

    // Add Internet node at top
    newNodes.push({
      id: "internet",
      type: "internet",
      position: { x: 0, y: 0 }, // Dagre will calculate actual position
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

    // Group clients by device
    const deviceClients = new Map<string, Array<{
      id: string;
      hostname: string;
      macAddress: string;
      ipAddress: string;
      signalStrength: number;
    }>>();
    clientIds.forEach((id) => {
      const client = clientsData[id];
      if (client && client.connected !== false) {
        const devId = client.deviceId as string;
        if (!deviceClients.has(devId)) {
          deviceClients.set(devId, []);
        }
        deviceClients.get(devId)!.push({
          id,
          hostname: (client.hostname as string) || "",
          macAddress: (client.macAddress as string) || "",
          ipAddress: (client.ipAddress as string) || "",
          signalStrength: (client.signalStrength as number) || 0,
        });
      }
    });

    // Find gateways - check device role field first, then mesh role
    const gateways: string[] = [];
    deviceIds.forEach((id) => {
      const device = devicesData[id] || {};
      const deviceRole = device.role as string;
      const meshInfo = deviceMeshInfo.get(id);

      // Device is a gateway if its role is "gateway" or mesh role is "gate"
      if (deviceRole === "gateway" || meshInfo?.role === "gate") {
        gateways.push(id);
      }
    });

    // If no gateways found, use first online device as gateway
    if (gateways.length === 0 && deviceIds.length > 0) {
      const firstOnline = deviceIds.find(
        (id) => devicesData[id]?.status === "online"
      );
      if (firstOnline) gateways.push(firstOnline);
    }

    // Track client node IDs per device for layout
    const deviceClientNodeIds = new Map<string, string[]>();

    // Create device nodes
    deviceIds.forEach((id) => {
      const device = devicesData[id] || {};
      const meshInfo = deviceMeshInfo.get(id);
      const isGateway = gateways.includes(id);
      const interfaces = deviceInterfaces.get(id) || [];

      const nodeData: DeviceNodeData = {
        id,
        hostname: (device.hostname as string) || id,
        model: (device.model as string) || "Unknown",
        tailscaleIp: (device.tailscaleIp as string) || "",
        status: (device.status as string) || "unknown",
        isMeshNode: !!meshInfo || (device.meshEnabled as boolean) || false,
        isGateway,
        interfaces,
      };

      newNodes.push({
        id,
        type: "device",
        position: { x: 0, y: 0 },
        data: nodeData,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });

      // Connect gateways to internet
      if (isGateway) {
        layoutEdges.push({
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

      // Add client nodes for this device
      const clients = deviceClients.get(id) || [];
      const clientNodeIds: string[] = [];

      clients.forEach((client) => {
        const clientNodeId = `client-${client.id}`;
        clientNodeIds.push(clientNodeId);

        newNodes.push({
          id: clientNodeId,
          type: "client",
          position: { x: 0, y: 0 },
          data: {
            id: client.id,
            hostname: client.hostname,
            macAddress: client.macAddress,
            ipAddress: client.ipAddress,
            signalStrength: client.signalStrength,
            deviceId: id,
          } as ClientNodeData,
        });

        layoutEdges.push({
          id: `${id}-${clientNodeId}`,
          source: id,
          target: clientNodeId,
          type: "smoothstep",
          style: {
            stroke: getEdgeColor("lan"),
            strokeWidth: 1,
            opacity: 0.6,
          },
        });
      });

      deviceClientNodeIds.set(id, clientNodeIds);
    });

    // Connect non-gateway devices to the primary gateway
    deviceIds.forEach((id) => {
      if (gateways.includes(id)) return;

      if (gateways.length > 0) {
        const device = devicesData[id] || {};
        const isOnline = device.status === "online";
        const primaryGateway = gateways[0];
        const gatewayDevice = devicesData[primaryGateway] || {};
        const gatewayOnline = gatewayDevice.status === "online";

        layoutEdges.push({
          id: `lan-${primaryGateway}-${id}`,
          source: primaryGateway,
          target: id,
          type: "smoothstep",
          animated: isOnline && gatewayOnline,
          style: {
            stroke: getEdgeColor("lan"),
            strokeWidth: 2,
          },
          label: "LAN",
          labelStyle: { fontSize: 10 },
        });
      }
    });

    // Add mesh connections between devices (visual only, NOT used for layout)
    const meshConnections = new Set<string>();
    meshNodeIds.forEach((id) => {
      const mesh = meshNodesData[id];
      if (!mesh) return;

      const sourceDeviceId = mesh.deviceId as string;
      const neighbors = (mesh.neighbors as number) || 0;

      if (neighbors > 0) {
        meshNodeIds.forEach((otherId) => {
          if (id === otherId) return;
          const otherMesh = meshNodesData[otherId];
          if (!otherMesh) return;

          const targetDeviceId = otherMesh.deviceId as string;
          if (sourceDeviceId === targetDeviceId) return;

          const connKey = [sourceDeviceId, targetDeviceId].sort().join("-");
          if (meshConnections.has(connKey)) return;
          meshConnections.add(connKey);

          visualEdges.push({
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

    // Apply hub-spoke layout
    const layouted = getHubSpokeLayout({
      nodes: newNodes,
      edges: layoutEdges,
      gatewayIds: gateways,
      deviceClients: deviceClientNodeIds,
    });

    setNodes(layouted.nodes);
    // Combine layout edges with visual-only edges
    setEdges([...layouted.edges, ...visualEdges]);
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
    if (node.type === "client") {
      const data = node.data as ClientNodeData;
      if (data?.signalStrength >= -50) return "#22c55e";
      if (data?.signalStrength >= -70) return "#eab308";
      return "#ef4444";
    }
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

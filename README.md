# OpenWRT Network Manager

A centralized management dashboard for OpenWRT routers with real-time synchronization, approval workflows, and SSH-based configuration management.

## Features

- **Multi-Router Management**: Manage multiple OpenWRT devices from a single dashboard
- **Real-time Sync**: CRDT-based synchronization using TinyBase for instant updates across clients
- **Approval Workflow**: All configuration changes go through an approval queue before execution
- **Tailscale Integration**: Automatic device discovery via Tailscale API
- **Comprehensive Management**:
  - Network interfaces and routing
  - Wireless radios, SSIDs, and client monitoring
  - Firewall zones, rules, and port forwards
  - DHCP leases and static assignments
  - VPN (WireGuard and OpenVPN)
  - Package management
  - System services
  - Logs and backups
  - Mesh networking (batman-adv)
  - QoS/SQM configuration

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Browser UI    │◄──────────────────►│   Node Server   │
│   (React/Vite)  │     TinyBase       │   (Elysia.js)   │
└─────────────────┘     CRDT Sync      └────────┬────────┘
                                                │
                                                │ SSH
                                                ▼
                                       ┌─────────────────┐
                                       │  OpenWRT Devices │
                                       │  (via Tailscale) │
                                       └─────────────────┘
```

### Key Components

- **TinyBase MergeableStore**: Conflict-free replicated data store synced between all clients and server
- **Change Queue System**: All modifications create pending changes that require approval
- **Execution Engine**: Approved changes are executed on devices via SSH
- **Polling Service**: Automatic periodic status updates from all devices

## Project Structure

```
├── client/                    # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── openwrt/       # Feature components
│   │   │   │   ├── devices/   # Router management
│   │   │   │   ├── network/   # Interface config
│   │   │   │   ├── wireless/  # WiFi management
│   │   │   │   ├── firewall/  # Firewall rules
│   │   │   │   ├── vpn/       # WireGuard/OpenVPN
│   │   │   │   ├── services/  # DHCP, SQM
│   │   │   │   ├── system/    # Packages, services
│   │   │   │   ├── mesh/      # Mesh networking
│   │   │   │   ├── topology/  # Network visualization
│   │   │   │   ├── log-viewer/# System logs
│   │   │   │   ├── backups/   # Backup management
│   │   │   │   └── approval/  # Change approval
│   │   │   └── ui/            # Shared UI components
│   │   ├── lib/
│   │   │   └── api.ts         # API client
│   │   ├── hooks/
│   │   │   └── useApi.ts      # API hooks
│   │   └── store/
│   │       └── index.ts       # TinyBase store schema
│   └── package.json
│
├── server/                    # Node.js backend
│   ├── index.ts               # Main server (Elysia + WebSocket)
│   └── lib/
│       ├── ssh/               # SSH execution
│       └── openwrt/           # OpenWRT management
│           ├── commands/      # SSH command templates
│           │   ├── system.ts
│           │   ├── network.ts
│           │   ├── wireless.ts
│           │   ├── firewall.ts
│           │   ├── dhcp.ts
│           │   ├── packages.ts
│           │   ├── sqm.ts
│           │   ├── mesh.ts
│           │   ├── backup.ts
│           │   └── vpn.ts
│           ├── device-service.ts    # Device operations
│           ├── polling-service.ts   # Status polling
│           ├── execution-engine.ts  # Change execution
│           ├── change-queue.ts      # Approval workflow
│           ├── ssh-commands.ts      # SSH wrapper
│           └── uci-parser.ts        # UCI config parser
│
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- OpenWRT devices accessible via SSH
- Tailscale network (optional, for device discovery)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/cd-slash/network-manager.git
cd network-manager
```

2. Install dependencies:
```bash
# Client
cd client && npm install

# Server
cd ../server && npm install
```

3. Configure SSH access:
   - Ensure your SSH key is added to OpenWRT devices
   - Default user is `root` (standard for OpenWRT)

4. Start the server:
```bash
cd server && npm run dev
```

5. Start the client:
```bash
cd client && npm run dev
```

6. Open http://localhost:5173

## Usage

### Adding Devices

1. Navigate to **Routers** in the sidebar
2. Click **Discover** to find devices via Tailscale API
3. Or manually add devices using their Tailscale IP

### Managing Configuration

1. Make changes through the UI (network, wireless, firewall, etc.)
2. Changes are queued in the **Approval Queue**
3. Review and approve changes
4. Approved changes are executed on devices via SSH

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/openwrt/discover` | POST | Discover devices via Tailscale |
| `/api/openwrt/devices/:id/status` | GET | Get device status |
| `/api/openwrt/devices/:id/refresh` | POST | Refresh all device data |
| `/api/openwrt/devices/:id/network` | GET | Get network interfaces |
| `/api/openwrt/devices/:id/wireless` | GET | Get wireless status |
| `/api/openwrt/devices/:id/firewall` | GET | Get firewall config |
| `/api/openwrt/devices/:id/packages` | GET/POST | Manage packages |
| `/api/openwrt/devices/:id/services/:name` | POST | Control services |
| `/api/openwrt/devices/:id/logs` | GET | Get system logs |
| `/api/openwrt/devices/:id/backups` | GET/POST | Manage backups |
| `/api/openwrt/devices/:id/wireguard/status` | GET | Get WireGuard status |
| `/api/openwrt/devices/:id/openvpn/status` | GET | Get OpenVPN status |
| `/api/changes/:id/execute` | POST | Execute approved change |
| `/api/changes/execute-all` | POST | Execute all approved changes |
| `/api/polling/status` | GET | Get polling service status |
| `/api/polling/start` | POST | Start polling service |
| `/api/polling/stop` | POST | Stop polling service |

## Data Model

### TinyBase Tables

| Table | Description |
|-------|-------------|
| `openwrtDevices` | Registered router devices |
| `networkInterfaces` | Network interface configurations |
| `wirelessRadios` | WiFi radio settings |
| `wirelessSSIDs` | SSID configurations |
| `wirelessClients` | Connected wireless clients |
| `firewallZones` | Firewall zone definitions |
| `firewallRules` | Traffic rules |
| `portForwards` | Port forwarding rules |
| `dhcpLeases` | Active DHCP leases |
| `installedPackages` | Installed packages per device |
| `systemServices` | System service states |
| `systemLogs` | Parsed log entries |
| `pendingChanges` | Changes awaiting approval |
| `changeHistory` | Executed change history |
| `wireguardPeers` | WireGuard peer configurations |
| `openvpnInstances` | OpenVPN instance states |
| `meshNodes` | Mesh network nodes |
| `sqmConfigs` | SQM/QoS configurations |

## Technology Stack

- **Frontend**: React 19, Vite, TailwindCSS, shadcn/ui, React Flow
- **Backend**: Node.js, Elysia.js, WebSocket
- **State Management**: TinyBase (CRDT MergeableStore)
- **Styling**: TailwindCSS with dark mode
- **Icons**: Lucide React

## Security Considerations

- All SSH connections should use key-based authentication
- Tailscale provides encrypted mesh networking
- Sensitive data (API keys, SSH keys) should be stored securely
- The approval workflow prevents accidental misconfigurations

## License

MIT

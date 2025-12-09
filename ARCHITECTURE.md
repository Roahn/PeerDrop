# PeerDrop Architecture Review

## Current Architecture

### Components
1. **Server (Node.js/Express)** - Runs on each peer's machine on port 3001
2. **Frontend (React)** - Connects to local server via WebSocket
3. **Discovery Service** - UDP broadcast + HTTP scanning to find peers
4. **WebSocket Service** - Handles real-time communication
5. **Message Forwarding** - Server-to-server HTTP forwarding

### Communication Flow

#### Peer Discovery
```
Peer A                    Peer B
  |                         |
  |-- UDP Broadcast ------->|
  |<-- UDP Response --------|
  |                         |
  |-- HTTP /api/health ---->|
  |<-- 200 OK -------------|
```

#### Message Sending (Peer A → Peer B)
```
Peer A Frontend
  |
  |-- WebSocket (localhost:3001) --> Peer A Server
  |                                    |
  |                                    |-- HTTP POST --> Peer B Server (http://PeerB_IP:3001/api/forward)
  |                                    |                    |
  |                                    |                    |-- WebSocket (localhost:3001) --> Peer B Frontend
```

### Issues Identified

1. **Message Flow Confusion**
   - Frontend → Local Server (WebSocket) ✅
   - Local Server → Remote Server (HTTP) ✅
   - Remote Server → Remote Frontend (WebSocket) ✅
   - This is correct, but the code might have unnecessary complexity

2. **Polling Mechanism**
   - Currently polls from the sender's side
   - Should poll from the receiver's side (unreachable peer polls reachable peer)
   - Polling logic might be backwards

3. **Pending Messages Storage**
   - Messages stored by targetIP (correct)
   - But polling endpoint needs to know which peer is requesting

4. **Connection State Management**
   - Multiple places managing connection state
   - Could be simplified

## Proposed Improvements

1. **Simplify Message Forwarding**
   - Remove unnecessary local WebSocket checks (except for same-machine testing)
   - Always use server-to-server forwarding for peer-to-peer

2. **Fix Polling Direction**
   - Unreachable peer should poll reachable peer's server
   - Store messages on the reachable peer's server

3. **Clear Separation of Concerns**
   - Server handles server-to-server communication
   - Frontend handles UI and local WebSocket connection
   - Clear message routing

4. **Better Error Handling**
   - Clear distinction between network errors and server errors
   - Better user feedback


import { WebSocketServer } from 'ws';
import { getLocalIP } from '../utils/network.js';
import { addPeer } from './peerManager.js';
import http from 'http';

let wss = null;
const clients = new Map(); // Map of IP -> WebSocket connection
const clientIPs = new Map(); // Map of WebSocket -> IP
const pendingSignaling = new Map(); // Map of targetIP -> Array of pending signaling messages

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
export function initializeWebSocketServer(server) {
  if (wss) {
    return wss;
  }

  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // Get client IP from request
    const clientIP = req.socket.remoteAddress?.replace('::ffff:', '') || 
                     req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     'unknown';
    
    console.log(`🔌 WebSocket client connected: ${clientIP}`);

    // Store with connection IP as fallback
    clients.set(clientIP, ws);
    clientIPs.set(ws, clientIP);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to PeerDrop server',
      yourIP: getLocalIP()
    }));

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        console.log(`📥 [WebSocket] Received message from ${clientIP}:`);
        console.log(`   Type: ${data.type}`);
        console.log(`   Data:`, JSON.stringify(data, null, 2));
        
        // Handle registration
        if (data.type === 'register' && data.clientIP) {
          // Remove old mapping if exists
          const oldIP = clientIPs.get(ws);
          if (oldIP && oldIP !== data.clientIP) {
            clients.delete(oldIP);
          }
          
          // Update mapping with reported IP
          clients.set(data.clientIP, ws);
          clientIPs.set(ws, data.clientIP);
          console.log(`📝 Client registered with IP: ${data.clientIP} (connection IP: ${clientIP})`);
          console.log(`📋 Total clients: ${clients.size}`);
          return;
        }
        
        // Handle other messages
        handleWebSocketMessage(ws, clientIP, data);
      } catch (error) {
        console.error(`❌ Error parsing WebSocket message from ${clientIP}:`, error);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      const ip = clientIPs.get(ws) || clientIP;
      console.log(`🔌 WebSocket client disconnected: ${ip}`);
      clients.delete(ip);
      clientIPs.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      const ip = clientIPs.get(ws) || clientIP;
      console.error('WebSocket error:', error);
      clients.delete(ip);
      clientIPs.delete(ws);
    });
  });

  console.log('📡 WebSocket server initialized');
  return wss;
}

/**
 * Handle incoming WebSocket messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} clientIP - Client IP address (connection IP)
 * @param {Object} data - Parsed message data
 */
function handleWebSocketMessage(ws, clientIP, data) {
  // Get the registered IP (preferred) or fall back to connection IP
  const senderIP = clientIPs.get(ws) || clientIP;
  
  switch (data.type) {
    case 'connection_request':
      // Forward connection request to target peer (signaling)
      console.log(`📤 Signaling: Connection request from ${senderIP} to ${data.targetIP}`);
      
      // Automatically add the sender to discovered peers (if not already there)
      // This ensures peers appear in the UI even if discovery didn't find them
      addPeer({
        id: senderIP,
        name: data.fromName || `Peer ${senderIP}`,
        ip: senderIP,
        port: 3001,
        lastSeen: new Date().toISOString()
      });
      console.log(`➕ Auto-added peer ${senderIP} to discovered peers`);
      
      forwardSignalingMessage(data.targetIP, {
        type: 'connection_request',
        fromIP: senderIP,
        fromName: data.fromName || `Peer ${senderIP}`,
        timestamp: new Date().toISOString()
      });
      break;

    case 'connection_accept':
    case 'connection_reject':
      // Forward connection response (signaling)
      console.log(`📤 Signaling: ${data.type} from ${senderIP} to ${data.targetIP}`);
      forwardSignalingMessage(data.targetIP, {
        type: data.type,
        fromIP: senderIP,
        fromName: data.fromName || `Peer ${senderIP}`,
        timestamp: new Date().toISOString()
      });
      break;

    case 'webrtc_offer':
      // Forward WebRTC offer (signaling)
      console.log(`📤 Signaling: WebRTC offer from ${senderIP} to ${data.targetIP}`);
      forwardSignalingMessage(data.targetIP, {
        type: 'webrtc_offer',
        fromIP: senderIP,
        offer: data.offer,
        timestamp: new Date().toISOString()
      });
      break;

    case 'webrtc_answer':
      // Forward WebRTC answer (signaling)
      console.log(`📤 Signaling: WebRTC answer from ${senderIP} to ${data.targetIP}`);
      forwardSignalingMessage(data.targetIP, {
        type: 'webrtc_answer',
        fromIP: senderIP,
        answer: data.answer,
        timestamp: new Date().toISOString()
      });
      break;

    case 'webrtc_ice_candidate':
      // Forward ICE candidate (signaling)
      forwardSignalingMessage(data.targetIP, {
        type: 'webrtc_ice_candidate',
        fromIP: senderIP,
        candidate: data.candidate,
        timestamp: new Date().toISOString()
      });
      break;

    case 'ping':
      // Respond to ping
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      console.log('Unknown message type:', data.type);
  }
}

/**
 * Forward signaling message to a peer's server
 * This is used only for WebRTC signaling (connection requests, SDP, ICE candidates)
 * @param {string} targetIP - Target peer IP address
 * @param {Object} message - Signaling message to forward
 */
function forwardSignalingMessage(targetIP, message) {
  const localIP = getLocalIP();
  
  // If target is ourselves, send directly to local WebSocket client
  if (targetIP === localIP) {
    const ws = clients.get(localIP);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
      console.log(`✅ Signaling message sent locally to ${targetIP}`);
      return;
    }
  }
  
  // Forward to remote peer's server via HTTP
  forwardToRemoteServer(targetIP, message).then(success => {
    if (!success) {
      // If forwarding failed, store for polling (one-way network scenario)
      if (!pendingSignaling.has(targetIP)) {
        pendingSignaling.set(targetIP, []);
      }
      pendingSignaling.get(targetIP).push({
        ...message,
        storedAt: new Date().toISOString()
      });
      console.log(`💾 Stored signaling message for ${targetIP} (will be available via polling)`);
      console.log(`   Message type: ${message.type}`);
    }
  }).catch(err => {
    console.error(`❌ Failed to forward signaling to ${targetIP}:`, err.message);
    // Store for polling even on error
    if (!pendingSignaling.has(targetIP)) {
      pendingSignaling.set(targetIP, []);
    }
    pendingSignaling.get(targetIP).push({
      ...message,
      storedAt: new Date().toISOString()
    });
    console.log(`💾 Stored signaling message for ${targetIP} (will be available via polling)`);
  });
}

/**
 * Handle incoming forwarded signaling message from another server
 * Delivers the signaling message to the local WebSocket client if connected
 * @param {Object} message - Signaling message to deliver
 * @returns {boolean} - True if message was delivered
 */
export function handleForwardedMessage(message) {
  console.log(`📥 Received signaling message:`, message.type);
  
  const localIP = getLocalIP();
  let delivered = false;
  
  // Try to find client registered with local IP first
  const ws = clients.get(localIP);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    console.log(`✅ Delivered signaling message to local client (${localIP})`);
    delivered = true;
  } else {
    // If no exact match, send to first available connected client
    for (const [ip, wsConnection] of clients.entries()) {
      if (wsConnection.readyState === wsConnection.OPEN) {
        wsConnection.send(JSON.stringify(message));
        console.log(`✅ Delivered signaling message to local client (${ip})`);
        delivered = true;
        break;
      }
    }
  }
  
  if (!delivered) {
    console.warn(`⚠️ Could not deliver signaling message - no local client connected`);
  }
  
  return delivered;
}

/**
 * Check if an IP is likely unreachable (link-local or NAT)
 * Note: We don't filter out 192.168.56.x or other virtual networks
 * because they might be real peers on those networks
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP should be skipped
 */
function shouldSkipIP(ip) {
  const parts = ip.split('.');
  const firstOctet = parseInt(parts[0]);
  const secondOctet = parseInt(parts[1]);
  
  // Link-local addresses (APIPA) - these are auto-assigned and usually not reachable
  if (firstOctet === 169 && secondOctet === 254) {
    return true;
  }
  
  // VirtualBox NAT (10.0.2.x) - these are typically not reachable from host
  if (firstOctet === 10 && secondOctet === 0 && parseInt(parts[2]) === 2) {
    return true;
  }
  
  return false;
}

function forwardToRemoteServer(targetIP, message) {
  // Only skip obviously unreachable IPs
  if (shouldSkipIP(targetIP)) {
    console.warn(`⚠️ Skipping forward to unreachable IP: ${targetIP}`);
    return Promise.resolve(false);
  }
  
  return new Promise((resolve) => {
    const postData = JSON.stringify(message);
    
    const options = {
      hostname: targetIP,
      port: 3001,
      path: '/api/forward',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ Signaling forwarded to remote server ${targetIP}:3001`);
          resolve(true);
        } else {
          console.warn(`⚠️ Remote server ${targetIP}:3001 returned status ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      if (error.code !== 'ECONNRESET' && error.code !== 'ETIMEDOUT') {
        console.warn(`❌ Failed to forward signaling to ${targetIP}:3001:`, error.message);
      }
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn(`⏱️ Timeout forwarding signaling to ${targetIP}:3001`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Broadcast message to all connected clients
 * @param {Object} message - Message to broadcast
 */
export function broadcast(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(messageStr);
    }
  });
}

/**
 * Get connected clients count
 * @returns {number} Number of connected clients
 */
export function getConnectedClientsCount() {
  return clients.size;
}

/**
 * Get pending signaling messages for a peer (for polling)
 * @param {string} peerIP - IP address of the peer requesting messages
 * @returns {Array} Array of pending signaling messages
 */
export function getPendingSignaling(peerIP) {
  const messages = pendingSignaling.get(peerIP) || [];
  // Clear the messages after retrieving them
  pendingSignaling.delete(peerIP);
  if (messages.length > 0) {
    console.log(`📬 Returning ${messages.length} pending signaling message(s) for ${peerIP}`);
  }
  return messages;
}

/**
 * Clear pending signaling messages for a peer
 * @param {string} peerIP - IP address of the peer
 */
export function clearPendingSignaling(peerIP) {
  pendingSignaling.delete(peerIP);
}



import { WebSocketServer } from 'ws';
import { getLocalIP } from '../utils/network.js';
import http from 'http';

let wss = null;
const clients = new Map(); // Map of IP -> WebSocket connection
const clientIPs = new Map(); // Map of WebSocket -> IP

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
        console.error('Error parsing WebSocket message:', error);
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
      // Forward connection request to target peer
      console.log(`📤 Forwarding connection request from ${senderIP} to ${data.targetIP}`);
      const connectionRequestMessage = {
        type: 'connection_request',
        fromIP: senderIP,
        fromName: data.fromName || `Peer ${senderIP}`,
        timestamp: new Date().toISOString()
      };
      console.log(`📨 Connection request message:`, JSON.stringify(connectionRequestMessage));
      forwardMessage(data.targetIP, connectionRequestMessage).catch(err => console.error('Error forwarding connection request:', err));
      break;

    case 'connection_accept':
    case 'connection_reject':
      // Forward connection response to sender
      console.log(`📤 Forwarding ${data.type} from ${senderIP} to ${data.targetIP}`);
      forwardMessage(data.targetIP, {
        type: data.type,
        fromIP: senderIP,
        fromName: data.fromName || `Peer ${senderIP}`,
        timestamp: new Date().toISOString()
      }).catch(err => console.error(`Error forwarding ${data.type}:`, err));
      break;

    case 'message':
      // Forward message to target peer
      forwardMessage(data.targetIP, {
        type: 'message',
        fromIP: senderIP,
        fromName: data.fromName || `Peer ${senderIP}`,
        message: data.message,
        timestamp: new Date().toISOString()
      }).catch(err => console.error('Error forwarding message:', err));
      break;

    case 'file_offer':
      // Forward file offer to target peer
      forwardMessage(data.targetIP, {
        type: 'file_offer',
        fromIP: senderIP,
        fromName: data.fromName || `Peer ${senderIP}`,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        fileId: data.fileId,
        timestamp: new Date().toISOString()
      }).catch(err => console.error('Error forwarding file offer:', err));
      break;

    case 'file_accept':
    case 'file_reject':
      // Forward file response to sender
      forwardMessage(data.targetIP, {
        type: data.type,
        fileId: data.fileId,
        fromIP: senderIP
      }).catch(err => console.error(`Error forwarding ${data.type}:`, err));
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
 * Forward message to a specific peer
 * First tries local WebSocket, then tries server-to-server HTTP forwarding
 * @param {string} targetIP - Target peer IP address
 * @param {Object} message - Message to forward
 * @returns {Promise<boolean>} - True if message was forwarded successfully
 */
async function forwardMessage(targetIP, message) {
  // Log available clients for debugging
  const availableIPs = Array.from(clients.keys());
  console.log(`🔍 Looking for peer: ${targetIP}`);
  console.log(`📋 Available clients: ${availableIPs.join(', ')}`);
  
  // Try exact match first
  let ws = clients.get(targetIP);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    console.log(`✅ Message forwarded locally to ${targetIP}`);
    return true;
  }
  
  // Try partial match (for cases where IP format differs, e.g., ::ffff:192.168.0.104 vs 192.168.0.104)
  for (const [ip, wsConnection] of clients.entries()) {
    // Normalize IPs for comparison (remove IPv6 prefix)
    const normalizedIP = ip.replace('::ffff:', '');
    const normalizedTarget = targetIP.replace('::ffff:', '');
    
    if (normalizedIP === normalizedTarget || 
        normalizedIP.includes(normalizedTarget) || 
        normalizedTarget.includes(normalizedIP)) {
      if (wsConnection.readyState === wsConnection.OPEN) {
        wsConnection.send(JSON.stringify(message));
        console.log(`✅ Message forwarded locally to ${ip} (matched ${targetIP})`);
        return true;
      }
    }
  }
  
  // If not found locally, try forwarding to the peer's server via HTTP
  console.log(`🌐 Peer ${targetIP} not connected locally, trying server-to-server forwarding...`);
  return await forwardToRemoteServer(targetIP, message);
}

/**
 * Handle incoming forwarded message from another server
 * Delivers the message to the local WebSocket client if connected
 * @param {Object} message - Message to deliver
 * @returns {boolean} - True if message was delivered
 */
export function handleForwardedMessage(message) {
  // When a message is forwarded to this server, it should be delivered to
  // the local WebSocket client (typically the frontend connected to this server)
  // Since there's usually one client per server, we can send to any connected client
  // or find the one that matches the server's local IP
  
  console.log(`📥 Received forwarded message:`, JSON.stringify(message));
  
  const localIP = getLocalIP();
  let delivered = false;
  
  // Try to find client registered with local IP first
  const ws = clients.get(localIP);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    console.log(`✅ Delivered forwarded message to local client (${localIP})`);
    delivered = true;
  } else {
    // If no exact match, send to first available connected client
    for (const [ip, wsConnection] of clients.entries()) {
      if (wsConnection.readyState === wsConnection.OPEN) {
        wsConnection.send(JSON.stringify(message));
        console.log(`✅ Delivered forwarded message to local client (${ip})`);
        delivered = true;
        break;
      }
    }
  }
  
  if (!delivered) {
    console.warn(`⚠️ Could not deliver forwarded message - no local client connected`);
    console.warn(`   Available clients: ${Array.from(clients.keys()).join(', ')}`);
  }
  
  return delivered;
}

/**
 * Forward message to a remote peer's server via HTTP
 * @param {string} targetIP - Target peer IP address
 * @param {Object} message - Message to forward
 */
function forwardToRemoteServer(targetIP, message) {
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
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ Message forwarded to remote server ${targetIP}:3001`);
          resolve(true);
        } else {
          console.warn(`⚠️ Remote server ${targetIP}:3001 returned status ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.warn(`❌ Failed to forward to remote server ${targetIP}:3001:`, error.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn(`⏱️ Timeout forwarding to remote server ${targetIP}:3001`);
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


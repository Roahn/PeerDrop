import { WebSocketServer } from 'ws';
import { getLocalIP } from '../utils/network.js';

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
          // Update mapping with reported IP
          clients.set(data.clientIP, ws);
          clientIPs.set(ws, data.clientIP);
          console.log(`📝 Client registered with IP: ${data.clientIP}`);
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
 * @param {string} clientIP - Client IP address
 * @param {Object} data - Parsed message data
 */
function handleWebSocketMessage(ws, clientIP, data) {
  switch (data.type) {
    case 'connection_request':
      // Forward connection request to target peer
      forwardMessage(data.targetIP, {
        type: 'connection_request',
        fromIP: clientIP,
        fromName: data.fromName || `Peer ${clientIP}`,
        timestamp: new Date().toISOString()
      });
      break;

    case 'connection_accept':
    case 'connection_reject':
      // Forward connection response to sender
      forwardMessage(data.targetIP, {
        type: data.type,
        fromIP: clientIP,
        fromName: data.fromName || `Peer ${clientIP}`,
        timestamp: new Date().toISOString()
      });
      break;

    case 'message':
      // Forward message to target peer
      forwardMessage(data.targetIP, {
        type: 'message',
        fromIP: clientIP,
        fromName: data.fromName || `Peer ${clientIP}`,
        message: data.message,
        timestamp: new Date().toISOString()
      });
      break;

    case 'file_offer':
      // Forward file offer to target peer
      forwardMessage(data.targetIP, {
        type: 'file_offer',
        fromIP: clientIP,
        fromName: data.fromName || `Peer ${clientIP}`,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        fileId: data.fileId,
        timestamp: new Date().toISOString()
      });
      break;

    case 'file_accept':
    case 'file_reject':
      // Forward file response to sender
      forwardMessage(data.targetIP, {
        type: data.type,
        fileId: data.fileId,
        fromIP: clientIP
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
 * Forward message to a specific peer
 * @param {string} targetIP - Target peer IP address
 * @param {Object} message - Message to forward
 */
function forwardMessage(targetIP, message) {
  // Try exact match first
  const ws = clients.get(targetIP);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  
  // Try partial match (for cases where IP format differs)
  for (const [ip, ws] of clients.entries()) {
    if (ip.includes(targetIP) || targetIP.includes(ip)) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
      }
    }
  }
  
  console.warn(`Could not find peer with IP: ${targetIP}`);
  return false;
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


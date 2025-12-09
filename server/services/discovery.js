import dgram from 'dgram';
import http from 'http';
import { getLocalIP, getHostname, generateIPRange } from '../utils/network.js';
import { addPeer } from './peerManager.js';

const DISCOVERY_PORT = 3002;
const SERVER_PORT = 3001;

let udpServer = null;

/**
 * Initialize UDP discovery server
 * @returns {dgram.Socket} UDP server instance
 */
export function initializeUDPServer() {
  if (udpServer) {
    return udpServer;
  }

  udpServer = dgram.createSocket('udp4');

  udpServer.on('message', (msg, rinfo) => {
    try {
      const message = JSON.parse(msg.toString());
      
      if (message.type === 'DISCOVERY_REQUEST') {
        // Another peer is looking for us, respond
        handleDiscoveryRequest(rinfo);
      } else if (message.type === 'DISCOVERY_RESPONSE') {
        // Another peer responded to our discovery request
        handleDiscoveryResponse(message);
      }
    } catch (error) {
      console.error('Error parsing UDP message:', error);
    }
  });

  udpServer.on('error', (err) => {
    console.error('UDP server error:', err);
  });

  udpServer.bind(DISCOVERY_PORT, () => {
    console.log(`📡 Discovery server listening on UDP port ${DISCOVERY_PORT}`);
  });

  return udpServer;
}

/**
 * Handle incoming discovery request
 * @param {Object} rinfo - Remote info object from UDP message
 */
function handleDiscoveryRequest(rinfo) {
  const response = JSON.stringify({
    type: 'DISCOVERY_RESPONSE',
    ip: getLocalIP(),
    port: SERVER_PORT,
    hostname: getHostname(),
    timestamp: new Date().toISOString()
  });
  
  udpServer.send(response, rinfo.port, rinfo.address, (err) => {
    if (err) console.error('Error sending discovery response:', err);
  });
}

/**
 * Handle incoming discovery response
 * @param {Object} message - Parsed discovery response message
 */
function handleDiscoveryResponse(message) {
  // Skip if it's our own IP or an unreachable IP
  if (message.ip === getLocalIP() || shouldSkipIP(message.ip)) {
    return;
  }
  
  addPeer({
    id: message.ip,
    name: message.hostname || `Peer ${message.ip}`,
    ip: message.ip,
    port: message.port || SERVER_PORT,
    lastSeen: new Date().toISOString()
  });
}

/**
 * Broadcast discovery request to the network
 */
export function broadcastDiscovery() {
  if (!udpServer) {
    console.warn('UDP server not initialized');
    return;
  }

  const message = JSON.stringify({
    type: 'DISCOVERY_REQUEST',
    ip: getLocalIP(),
    port: SERVER_PORT,
    hostname: getHostname()
  });
  
  const broadcastAddress = '255.255.255.255';
  udpServer.setBroadcast(true);
  
  udpServer.send(message, DISCOVERY_PORT, broadcastAddress, (err) => {
    if (err) {
      console.error('Error broadcasting discovery:', err);
    }
  });
}

/**
 * Check if an IP is likely a link-local or unreachable address
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

/**
 * Check if a peer server is running at the given IP
 * @param {string} ip - IP address to check
 * @returns {Promise<Object|null>} Server info if found, null otherwise
 */
async function checkPeerServer(ip) {
  // Only skip obviously unreachable IPs (link-local, NAT)
  if (shouldSkipIP(ip)) {
    return Promise.reject(new Error('Unreachable IP'));
  }
  
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${ip}:${SERVER_PORT}/api/health`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (jsonData.success) {
            addPeer({
              id: ip,
              name: `Peer ${ip}`,
              ip: ip,
              port: SERVER_PORT,
              lastSeen: new Date().toISOString()
            });
          }
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      });
    });
    
    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error('Timeout'));
    }, 500); // 500ms timeout per IP
    
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    
    req.setTimeout(500, () => {
      req.destroy();
      clearTimeout(timeout);
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Scan network for other PeerDrop servers
 * @param {number} batchSize - Number of IPs to scan concurrently (default: 20)
 */
export async function scanNetwork(batchSize = 20) {
  const localIP = getLocalIP();
  const ipParts = localIP.split('.');
  const baseIP = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
  
  const ipRange = generateIPRange(baseIP, localIP);
  
  // Process in batches to avoid overwhelming the network
  for (let i = 0; i < ipRange.length; i += batchSize) {
    const batch = ipRange.slice(i, i + batchSize);
    const scanPromises = batch.map(ip => 
      checkPeerServer(ip).catch(() => null)
    );
    
    await Promise.allSettled(scanPromises);
    
    // Small delay between batches to avoid network congestion
    if (i + batchSize < ipRange.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

import { clearPeers, getPeers, getPeerCount } from './peerManager.js';

/**
 * Discover peers using both UDP broadcast and network scanning
 * @returns {Promise<Array>} Array of discovered peers
 */
export async function discoverPeers() {
  // Clear previous discoveries
  clearPeers();
  
  console.log('🔍 Starting peer discovery...');
  
  // Method 1: Broadcast UDP discovery request
  broadcastDiscovery();
  
  // Method 2: Scan network for other PeerDrop servers
  await scanNetwork();
  
  // Wait a bit for UDP responses
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Broadcast again to catch any late responders
  broadcastDiscovery();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log(`✅ Discovery complete. Found ${getPeerCount()} peer(s)`);
  
  return getPeers();
}


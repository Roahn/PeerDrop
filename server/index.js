import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import dgram from 'dgram';
import http from 'http';

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;
const DISCOVERY_PORT = 3002; // UDP port for peer discovery

// Middleware
app.use(cors());
app.use(express.json());

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Get network subnet (e.g., 192.168.1.0 from 192.168.1.100)
function getNetworkSubnet(ip) {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

// Get hostname
function getHostname() {
  return os.hostname();
}

// Store discovered peers
let discoveredPeers = [];
const peerMap = new Map(); // Track peers by IP to avoid duplicates

// Setup UDP server for peer discovery
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
  try {
    const message = JSON.parse(msg.toString());
    
    if (message.type === 'DISCOVERY_REQUEST') {
      // Another peer is looking for us, respond
      const response = JSON.stringify({
        type: 'DISCOVERY_RESPONSE',
        ip: getLocalIP(),
        port: PORT,
        hostname: getHostname(),
        timestamp: new Date().toISOString()
      });
      
      udpServer.send(response, rinfo.port, rinfo.address, (err) => {
        if (err) console.error('Error sending discovery response:', err);
      });
    } else if (message.type === 'DISCOVERY_RESPONSE') {
      // Another peer responded to our discovery request
      if (message.ip !== getLocalIP()) {
        addPeer({
          id: message.ip,
          name: message.hostname || `Peer ${message.ip}`,
          ip: message.ip,
          port: message.port || PORT,
          lastSeen: new Date().toISOString()
        });
      }
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

// Add or update peer
function addPeer(peer) {
  const existingPeer = peerMap.get(peer.ip);
  if (!existingPeer || existingPeer.lastSeen < peer.lastSeen) {
    peerMap.set(peer.ip, peer);
    discoveredPeers = Array.from(peerMap.values());
  }
}

// Broadcast discovery request
function broadcastDiscovery() {
  const message = JSON.stringify({
    type: 'DISCOVERY_REQUEST',
    ip: getLocalIP(),
    port: PORT,
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

// Scan network for other PeerDrop servers
async function scanNetwork() {
  const localIP = getLocalIP();
  const ipParts = localIP.split('.');
  const baseIP = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
  
  // Scan IP range in batches to avoid overwhelming the network
  const batchSize = 20; // Scan 20 IPs at a time
  const ipRange = [];
  
  for (let i = 1; i <= 254; i++) {
    const targetIP = `${baseIP}.${i}`;
    if (targetIP !== localIP) {
      ipRange.push(targetIP);
    }
  }
  
  // Process in batches
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

// Check if a peer server is running
async function checkPeerServer(ip) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error('Timeout'));
    }, 500); // 500ms timeout per IP
    
    const req = http.get(`http://${ip}:${PORT}/api/health`, (res) => {
      clearTimeout(timeout);
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
              port: PORT,
              lastSeen: new Date().toISOString()
            });
          }
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      });
    });
    
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

// API Routes


// Discover peers on the same network
app.post('/api/discover', async (req, res) => {
  try {
    const localIP = getLocalIP();
    
    // Clear previous discoveries
    discoveredPeers = [];
    peerMap.clear();
    
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
    
    console.log(`✅ Discovery complete. Found ${discoveredPeers.length} peer(s)`);
    
    res.json({
      success: true,
      peers: discoveredPeers,
      localIP
    });
  } catch (error) {
    console.error('Error discovering peers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover peers'
    });
  }
});

// Get discovered peers
app.get('/api/peers', (req, res) => {
  res.json({
    success: true,
    peers: discoveredPeers
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PeerDrop Server running on http://localhost:${PORT}`);
  console.log(`📡 Network: ${getLocalIP()}`);
  console.log(`\n✅ Server is ready! Connect your frontend to http://localhost:${PORT}`);
  
  // Periodically broadcast our presence
  setInterval(() => {
    broadcastDiscovery();
  }, 10000); // Every 10 seconds
});


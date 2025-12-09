import express from 'express';
import { getLocalIP } from '../utils/network.js';
import { getPeers, clearPeers } from '../services/peerManager.js';
import { discoverPeers } from '../services/discovery.js';
import { handleForwardedMessage, getPendingSignaling } from '../services/websocket.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  console.log(`📥 [HTTP GET] /api/health from ${req.ip || req.socket.remoteAddress || 'unknown'}`);
  res.json({
    success: true,
    status: 'running',
    timestamp: new Date().toISOString(),
    localIP: getLocalIP()
  });
});

/**
 * Get local IP address
 */
router.get('/ip', (req, res) => {
  console.log(`📥 [HTTP GET] /api/ip from ${req.ip || req.socket.remoteAddress || 'unknown'}`);
  res.json({
    success: true,
    localIP: getLocalIP()
  });
});

/**
 * Discover peers on the same network
 */
router.post('/discover', async (req, res) => {
  console.log(`📥 [HTTP POST] /api/discover from ${req.ip || req.socket.remoteAddress || 'unknown'}`);
  try {
    const localIP = getLocalIP();
    const peers = await discoverPeers();
    
    console.log(`✅ Discovery request completed. Found ${peers.length} peer(s)`);
    res.json({
      success: true,
      peers,
      localIP
    });
  } catch (error) {
    console.error('❌ Error discovering peers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover peers'
    });
  }
});

/**
 * Get list of discovered peers
 */
router.get('/peers', (req, res) => {
  console.log(`📥 [HTTP GET] /api/peers from ${req.ip || req.socket.remoteAddress || 'unknown'}`);
  const peers = getPeers();
  console.log(`   Returning ${peers.length} peer(s)`);
  res.json({
    success: true,
    peers: peers
  });
});

/**
 * Forward signaling message from another server to local WebSocket client
 * Used for WebRTC signaling (connection requests, SDP offers/answers, ICE candidates)
 */
router.post('/forward', express.json(), (req, res) => {
  const fromIP = req.ip || req.socket.remoteAddress || 'unknown';
  const message = req.body;
  
  console.log(`📥 [HTTP POST] /api/forward from ${fromIP}`);
  console.log(`   Message type: ${message?.type || 'unknown'}`);
  console.log(`   From IP: ${message?.fromIP || 'unknown'}`);
  console.log(`   Target: ${message?.targetIP || 'N/A'}`);
  
  try {
    if (!message || !message.fromIP) {
      console.warn(`   ❌ Invalid message format`);
      return res.status(400).json({
        success: false,
        error: 'Invalid message format'
      });
    }
    
    // Deliver signaling message to local WebSocket client
    const delivered = handleForwardedMessage(message);
    
    if (delivered) {
      console.log(`   ✅ Signaling message delivered to local client`);
    } else {
      console.warn(`   ⚠️ Client not connected - message not delivered`);
    }
    
    res.json({
      success: delivered,
      message: delivered ? 'Signaling message delivered' : 'Client not connected'
    });
  } catch (error) {
    console.error(`   ❌ Error handling forwarded signaling message:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to forward signaling message'
    });
  }
});

/**
 * Poll for pending signaling messages (for peers that can't receive direct forwards)
 * Used when one-way network connectivity prevents direct signaling
 * @param {string} peerIP - IP address of the peer requesting messages (from query)
 */
router.get('/poll-signaling', (req, res) => {
  const fromIP = req.ip || req.socket.remoteAddress || 'unknown';
  const peerIP = req.query.ip || req.headers['x-peer-ip'];
  
  console.log(`📥 [HTTP GET] /api/poll-signaling from ${fromIP}`);
  console.log(`   Requesting peer IP: ${peerIP || 'not provided'}`);
  
  try {
    if (!peerIP) {
      console.warn(`   ❌ Peer IP required`);
      return res.status(400).json({
        success: false,
        error: 'Peer IP required (use ?ip=... or X-Peer-IP header)'
      });
    }
    
    const messages = getPendingSignaling(peerIP);
    
    if (messages.length > 0) {
      console.log(`   ✅ Returning ${messages.length} pending signaling message(s)`);
      messages.forEach(msg => {
        console.log(`      - ${msg.type} from ${msg.fromIP || 'unknown'}`);
      });
    } else {
      console.log(`   ℹ️ No pending signaling messages for ${peerIP}`);
    }
    
    res.json({
      success: true,
      messages: messages,
      count: messages.length
    });
  } catch (error) {
    console.error(`   ❌ Error polling signaling messages:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to poll signaling messages'
    });
  }
});

export default router;


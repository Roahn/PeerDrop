import express from 'express';
import { getLocalIP } from '../utils/network.js';
import { getPeers, clearPeers } from '../services/peerManager.js';
import { discoverPeers } from '../services/discovery.js';
import { handleForwardedMessage } from '../services/websocket.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
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
  res.json({
    success: true,
    localIP: getLocalIP()
  });
});

/**
 * Discover peers on the same network
 */
router.post('/discover', async (req, res) => {
  try {
    const localIP = getLocalIP();
    const peers = await discoverPeers();
    
    res.json({
      success: true,
      peers,
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

/**
 * Get list of discovered peers
 */
router.get('/peers', (req, res) => {
  res.json({
    success: true,
    peers: getPeers()
  });
});

/**
 * Forward signaling message from another server to local WebSocket client
 * Used for WebRTC signaling (connection requests, SDP offers/answers, ICE candidates)
 */
router.post('/forward', express.json(), (req, res) => {
  try {
    const message = req.body;
    
    if (!message || !message.fromIP) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message format'
      });
    }
    
    // Deliver signaling message to local WebSocket client
    const delivered = handleForwardedMessage(message);
    
    res.json({
      success: delivered,
      message: delivered ? 'Signaling message delivered' : 'Client not connected'
    });
  } catch (error) {
    console.error('Error handling forwarded signaling message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to forward signaling message'
    });
  }
});

export default router;


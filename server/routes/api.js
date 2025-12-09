import express from 'express';
import { getLocalIP } from '../utils/network.js';
import { getPeers, clearPeers } from '../services/peerManager.js';
import { discoverPeers } from '../services/discovery.js';

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

export default router;


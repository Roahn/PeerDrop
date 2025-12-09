import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { getLocalIP } from './utils/network.js';
import { initializeUDPServer, broadcastDiscovery } from './services/discovery.js';
import { initializeWebSocketServer } from './services/websocket.js';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket server
initializeWebSocketServer(server);

// Initialize UDP discovery server
initializeUDPServer();

// Start server
server.listen(PORT, () => {
  console.log(`🚀 PeerDrop Server running on http://localhost:${PORT}`);
  const localIP = getLocalIP(true); // Force log on startup
  console.log(`📡 Network: ${localIP}`);
  console.log(`\n✅ Server is ready! Connect your frontend to http://localhost:${PORT}`);
  
  // Periodically broadcast our presence
  setInterval(() => {
    broadcastDiscovery();
  }, 10000); // Every 10 seconds
});


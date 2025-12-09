import express from 'express';
import cors from 'cors';
import { getLocalIP } from './utils/network.js';
import { initializeUDPServer, broadcastDiscovery } from './services/discovery.js';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Initialize UDP discovery server
initializeUDPServer();

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


# PeerDrop Server

Local server for PeerDrop that provides WiFi network information and peer discovery capabilities.

## Installation

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

## Running the Server

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## API Endpoints

### GET `/api/network`
Get WiFi network name and local IP address.

**Response:**
```json
{
  "success": true,
  "networkName": "Your WiFi Network",
  "localIP": "192.168.1.100",
  "platform": "darwin"
}
```

### POST `/api/discover`
Discover peers on the same network.

**Response:**
```json
{
  "success": true,
  "peers": [
    {
      "id": "1",
      "name": "Peer 1",
      "ip": "192.168.1.101",
      "lastSeen": "2024-01-01T00:00:00.000Z"
    }
  ],
  "networkName": "Your WiFi Network",
  "localIP": "192.168.1.100"
}
```

### GET `/api/peers`
Get list of currently discovered peers.

### GET `/api/health`
Health check endpoint.

## WiFi Network Detection

The server automatically detects your WiFi network name across all platforms:

- **macOS**: Uses `networksetup` commands to detect the current WiFi network
- **Windows**: Uses `netsh wlan` command
- **Linux**: Uses `iwgetid` or `nmcli` commands

The detection works automatically - no manual configuration needed!

## Platform Support

The server automatically detects your operating system and uses the appropriate method:

- **macOS**: Uses `networksetup` command (may fail due to privacy restrictions - use manual config)
- **Windows**: Uses `netsh wlan show interfaces` command
- **Linux**: Uses `iwgetid` or `nmcli` commands

## Distribution

To distribute the server to users:

1. Create a zip file of the `server` directory
2. Users should:
   - Extract the zip file
   - Run `npm install` in the server directory
   - Run `npm start` to start the server

Or create a standalone executable using tools like:
- `pkg` - Package Node.js projects into executables
- `nexe` - Create a single executable out of your Node.js application
- `electron-builder` - For creating desktop applications

## Troubleshooting

### Server won't start
- Make sure port 3001 is not already in use
- Check that Node.js is installed (`node --version`)

### Can't detect WiFi name

The server should automatically detect your WiFi network. If it doesn't work:

- **macOS**: Make sure you're connected to WiFi (not just Ethernet)
- **Linux**: Ensure you have `iwgetid` or `nmcli` installed
- **Windows**: Ensure you're connected to WiFi

**Optional Manual Override:** If automatic detection fails, you can manually set it:
```bash
WIFI_NETWORK_NAME="YourNetworkName" npm start
```

### Frontend can't connect
- Ensure the server is running on `http://localhost:3001`
- Check browser console for CORS errors
- Verify firewall settings allow local connections


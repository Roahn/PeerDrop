# PeerDrop

Peer-to-peer file sharing application with local network discovery.

## Setup

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

### Server Setup (Required)

The PeerDrop server is required for WiFi network detection and peer discovery.

1. Navigate to the server directory:
```bash
cd server
```

2. Install server dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3001`

**Important:** The frontend requires the server to be running to function properly. Make sure to start the server before using the frontend.

## Features

- 🔍 Discover peers on the same WiFi network
- 📡 Display current WiFi network name
- 🌐 Cross-platform support (macOS, Windows, Linux)
- 🎨 Modern, responsive UI

## Project Structure

```
PeerDrop/
├── src/           # Frontend React application
├── server/        # Local Node.js server
└── dist/          # Production build
```

## Development

- Frontend: `npm run dev` (runs on http://localhost:5173)
- Server: `cd server && npm start` (runs on http://localhost:3001)

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Server Distribution

To distribute the server to users, see the [server README](./server/README.md) for details on packaging and distribution options.

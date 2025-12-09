#!/bin/bash

echo "🚀 Starting PeerDrop Server..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

echo "✅ Starting server on http://localhost:3001"
echo ""
npm start


#!/bin/bash
set -e

echo "Creating all apps from template..."

APPS=(
  "kanban-sse:3002"
  "kanban-longpolling:3003"
  "kanban-webrtc:3004"
  "chat-websocket:3005"
  "chat-sse:3006"
  "chat-longpolling:3007"
  "chat-webrtc:3008"
  "dashboard-websocket:3009"
  "dashboard-sse:3010"
  "dashboard-longpolling:3011"
  "dashboard-webrtc:3012"
)

TEMPLATE="apps/kanban-websocket"

for app_info in "${APPS[@]}"; do
  IFS=':' read -r app_name port <<< "$app_info"
  echo "Creating $app_name on port $port..."

  rm -rf "apps/$app_name"
  cp -r "$TEMPLATE" "apps/$app_name"

  # Update package.json
  sed -i.bak "s/kanban-websocket/$app_name/g" "apps/$app_name/package.json"
  sed -i.bak "s/3001/$port/g" "apps/$app_name/package.json"

  # Update vite.config.ts
  sed -i.bak "s/3001/$port/g" "apps/$app_name/vite.config.ts"

  # Update HTML title
  title=$(echo "$app_name" | sed 's/-/ - /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
  sed -i.bak "s/Kanban - WebSocket/$title/g" "apps/$app_name/index.html"
done

# Cleanup .bak files
find apps -name "*.bak" -delete

echo "✅ All apps created!"

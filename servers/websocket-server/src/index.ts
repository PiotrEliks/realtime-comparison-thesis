import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
app.use(cors());

const PORT = 4001;
const server = app.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', timestamp: message.timestamp }));
    } else {
      // Broadcast to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

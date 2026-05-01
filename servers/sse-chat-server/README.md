# SSE Chat Server

Real-time chat server using **Server-Sent Events (SSE)** + HTTP REST API.

## Features

✅ Server-Sent Events for real-time updates
✅ REST API for client actions
✅ PostgreSQL + Sequelize ORM
✅ JWT Authentication
✅ Message reactions (emoji)
✅ Message replies (threading)
✅ Typing indicators
✅ Read receipts
✅ Image uploads
✅ Private & group rooms
✅ Online status

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Database:** PostgreSQL
- **ORM:** Sequelize
- **Auth:** JWT
- **Real-time:** Server-Sent Events (SSE)

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure database
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Create database
```bash
createdb chat_sse_db
```

### 4. Run development server
```bash
npm run dev
```

Server will start on `http://localhost:4002`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login

### SSE Connection
- `GET /sse?token=<JWT>` - Establish SSE connection

### Messages
- `POST /api/messages` - Send message
- `PUT /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/read` - Mark as read
- `GET /api/messages/room/:roomId` - Get room messages

### Reactions
- `POST /api/reactions` - Add reaction
- `DELETE /api/reactions` - Remove reaction

### Typing
- `POST /api/typing/start` - Start typing
- `POST /api/typing/stop` - Stop typing

### Rooms
- `GET /api/rooms` - Get user's rooms
- `POST /api/rooms/private` - Create private room
- `POST /api/rooms/group` - Create group room
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms/:id/join` - Join room

### Upload
- `POST /api/upload` - Upload image

## SSE Events

Events sent from server to client:

- `CONNECTED` - Initial connection established
- `NEW_MESSAGE` - New message in room
- `MESSAGE_EDITED` - Message was edited
- `MESSAGE_DELETED` - Message was deleted
- `MESSAGE_READ` - Message was read by someone
- `REACTION_ADDED` - Reaction added to message
- `REACTION_REMOVED` - Reaction removed from message
- `USER_TYPING` - User started typing
- `USER_STOPPED_TYPING` - User stopped typing
- `USER_STATUS_CHANGE` - User online status changed
- `ROOM_JOINED` - Successfully joined room
- `USER_JOINED_ROOM` - Another user joined room

## Database Schema

- `users` - User accounts
- `rooms` - Chat rooms (private/group)
- `room_members` - Room membership
- `messages` - Chat messages
- `message_receipts` - Read receipts
- `reactions` - Emoji reactions

## Development

```bash
# Run with auto-reload
npm run dev

# Build for production
npm run build

# Run production
npm start
```

## Environment Variables

```env
PORT=4002
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chat_sse_db
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

## Architecture

```
Client                          Server
  │                                │
  ├─── GET /sse ────────────────→ EventSource
  │                                ├─ Keep-alive (30s)
  │                                ├─ CONNECTED
  │                                ├─ NEW_MESSAGE
  │ ←───────────────────────────── └─ ...events
  │
  ├─── POST /api/messages ──────→ Create message
  │ ←───────────────────────────── Response
  │                                │
  │                                ├─ Broadcast to room
  │ ←───────────────────────────── └─ NEW_MESSAGE event
```

## License

MIT

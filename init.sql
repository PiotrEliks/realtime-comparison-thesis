-- init.sql - Initialization script for all databases
-- This runs automatically when PostgreSQL container starts for the first time

-- Extensions (będą dostępne we wszystkich bazach)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DATABASE 1: realtime_chat (dla aplikacji chat)
-- ============================================================

-- Połącz się z bazą realtime_chat (jest tworzona automatycznie przez POSTGRES_DB)
\c realtime_chat;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'offline',
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table (dla grup i prywatnych chatów)
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    type VARCHAR(20) NOT NULL, -- 'private' lub 'group'
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Room members
CREATE TABLE IF NOT EXISTS room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member', -- 'admin' lub 'member'
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'text', -- 'text', 'system', 'file'
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message receipts table
CREATE TABLE IF NOT EXISTS message_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

-- Reactions table
CREATE TABLE IF NOT EXISTS reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
);

-- Typing indicators (tymczasowe)
CREATE TABLE IF NOT EXISTS typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id)
);

-- Indexes dla wydajności (CHAT)
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_message_receipts_message_id ON message_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_message_receipts_user_id ON message_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);

-- Triggers dla updated_at (CHAT)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Demo users dla CHAT (hasło to "password123")
-- Hash: $2b$10$rQZ9Z9Z9Z9Z9Z9Z9Z9Z9Z.dummy (to przykład, użyj prawdziwego)
INSERT INTO users (username, email, password_hash, display_name, status) VALUES
('alice', 'alice@example.com', '$2a$10$YourRealHashHere', 'Alice Wonder', 'online'),
('bob', 'bob@example.com', '$2a$10$YourRealHashHere', 'Bob Builder', 'online'),
('charlie', 'charlie@example.com', '$2a$10$YourRealHashHere', 'Charlie Brown', 'offline')
ON CONFLICT (username) DO NOTHING;

\echo '✅ Database realtime_chat initialized'


-- ============================================================
-- DATABASE 2: realtime_whiteboard (dla aplikacji whiteboard)
-- ============================================================

-- Stwórz nową bazę dla whiteboard
CREATE DATABASE realtime_whiteboard;

-- Połącz się z nową bazą
\c realtime_whiteboard;

-- Włącz rozszerzenia dla tej bazy
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (WHITEBOARD)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    cursor_color VARCHAR(7) DEFAULT '#FF6B6B', -- Unique color per user
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Boards table
CREATE TABLE IF NOT EXISTS boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    elements JSONB NOT NULL DEFAULT '[]', -- Canvas elements stored as JSON
    thumbnail TEXT,
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Board members
CREATE TABLE IF NOT EXISTS board_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(board_id, user_id)
);

-- Indexes dla wydajności (WHITEBOARD)
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON boards(created_by);
CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON board_members(user_id);
CREATE INDEX IF NOT EXISTS idx_board_members_board_id ON board_members(board_id);

-- Triggers dla updated_at (WHITEBOARD)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_boards_updated_at BEFORE UPDATE ON boards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Demo users dla WHITEBOARD
INSERT INTO users (username, email, password, display_name, cursor_color) VALUES
('alice', 'alice@whiteboard.com', '$2a$10$YourRealHashHere', 'Alice Wonder', '#FF6B6B'),
('bob', 'bob@whiteboard.com', '$2a$10$YourRealHashHere', 'Bob Builder', '#4ECDC4'),
('charlie', 'charlie@whiteboard.com', '$2a$10$YourRealHashHere', 'Charlie Brown', '#45B7D1')
ON CONFLICT (username) DO NOTHING;

-- Demo board
DO $$
DECLARE
    alice_id UUID;
    board_id UUID;
BEGIN
    SELECT id INTO alice_id FROM users WHERE username = 'alice';
    
    IF alice_id IS NOT NULL THEN
        INSERT INTO boards (name, description, created_by, elements)
        VALUES ('Demo Board', 'A demo whiteboard for testing', alice_id, '[]')
        RETURNING id INTO board_id;
        
        -- Add Alice as owner
        INSERT INTO board_members (board_id, user_id, role)
        VALUES (board_id, alice_id, 'owner');
    END IF;
END $$;

\echo '✅ Database realtime_whiteboard initialized'

-- PostgreSQL initialization for realtime_whiteboard database
-- This updates the users table to use password_hash instead of password

\c realtime_whiteboard;

-- Drop old column if exists and add new one
ALTER TABLE users DROP COLUMN IF EXISTS password CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';

-- Update demo users with bcrypt hashed passwords
-- Password for all demo users: "password123"
-- Hash: $2a$10$YQs8VVyEJQXjLmXKk5PBj.YzN5B0aKvN5vGxJGK5gKqY7XYzP.vNe

UPDATE users SET password_hash = '$2a$10$YQs8VVyEJQXjLmXKk5PBj.YzN5B0aKvN5vGxJGK5gKqY7XYzP.vNe' 
WHERE username IN ('alice', 'bob', 'charlie');

\echo '✅ Users table updated to use password_hash'

-- ============================================================
-- DATABASE 3: realtime_kanban  (Jira-like Kanban board)
-- ============================================================

CREATE DATABASE realtime_kanban;
\c realtime_kanban;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    username     VARCHAR(50)  UNIQUE NOT NULL,
    email        VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url   VARCHAR(500),
    color        VARCHAR(7)   DEFAULT '#6366f1',  -- kolor avatara
    role         VARCHAR(20)  DEFAULT 'member',   -- 'admin' | 'member'
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─── Projects (boards) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(200) NOT NULL,
    key         VARCHAR(10)  UNIQUE NOT NULL,  -- prefix tasków np. 'RT', 'KAN'
    description TEXT,
    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- ─── Project members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
    id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID      REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID      REFERENCES users(id)    ON DELETE CASCADE,
    role        VARCHAR(20) DEFAULT 'member',     -- 'owner' | 'member' | 'viewer'
    joined_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
);

-- ─── Tasks ────────────────────────────────────────────────────────────────────
-- Statusy: new | todo | to_fix | verification | fixed | to_merge | committed | to_deploy | done | rejected
CREATE TABLE IF NOT EXISTS tasks (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id   UUID        REFERENCES projects(id) ON DELETE CASCADE,
    task_number  INT         NOT NULL,   -- numer w obrębie projektu (RT-1, RT-2...)
    title        VARCHAR(500) NOT NULL,
    description  TEXT,
    status       VARCHAR(20)  NOT NULL DEFAULT 'new',
    priority     VARCHAR(10)  DEFAULT 'medium',  -- low | medium | high | critical
    type         VARCHAR(20)  DEFAULT 'task',    -- task | bug | feature | improvement | docs
    assignee_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    reporter_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    story_points INT,
    due_date     DATE,
    tags         TEXT[]      DEFAULT '{}',
    position     INT         DEFAULT 0,  -- kolejność w kolumnie
    created_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, task_number)
);

-- Sekwencja numerów tasków per projekt (symulujemy triggerem)
CREATE SEQUENCE IF NOT EXISTS task_number_seq START 1;

CREATE OR REPLACE FUNCTION next_task_number(proj_id UUID) RETURNS INT AS $$
DECLARE
    next_num INT;
BEGIN
    SELECT COALESCE(MAX(task_number), 0) + 1 INTO next_num FROM tasks WHERE project_id = proj_id;
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- ─── Task comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
    id         UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id    UUID      REFERENCES tasks(id)    ON DELETE CASCADE,
    user_id    UUID      REFERENCES users(id)    ON DELETE CASCADE,
    content    TEXT      NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Task history (audit log) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_history (
    id         UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id    UUID      REFERENCES tasks(id)  ON DELETE CASCADE,
    user_id    UUID      REFERENCES users(id)  ON DELETE SET NULL,
    action     VARCHAR(50) NOT NULL,   -- 'created' | 'status_changed' | 'assigned' | 'updated'
    field      VARCHAR(50),
    old_value  TEXT,
    new_value  TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_project_id  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_position    ON tasks(project_id, status, position);
CREATE INDEX IF NOT EXISTS idx_comments_task_id  ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_history_task_id   ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_proj_members_user ON project_members(user_id);

-- ─── Triggers updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_upd    BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_projects_upd BEFORE UPDATE ON projects      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_tasks_upd    BEFORE UPDATE ON tasks         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_comments_upd BEFORE UPDATE ON task_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Demo data ────────────────────────────────────────────────────────────────
-- Password dla wszystkich: "password123"
-- Hash: $2a$10$YQs8VVyEJQXjLmXKk5PBj.YzN5B0aKvN5vGxJGK5gKqY7XYzP.vNe
INSERT INTO users (username, email, password_hash, display_name, color, role) VALUES
('alice',   'alice@kanban.com',   '$2a$10$YQs8VVyEJQXjLmXKk5PBj.YzN5B0aKvN5vGxJGK5gKqY7XYzP.vNe', 'Alice Wonder',  '#6366f1', 'admin'),
('bob',     'bob@kanban.com',     '$2a$10$YQs8VVyEJQXjLmXKk5PBj.YzN5B0aKvN5vGxJGK5gKqY7XYzP.vNe', 'Bob Builder',   '#10b981', 'member'),
('charlie', 'charlie@kanban.com', '$2a$10$YQs8VVyEJQXjLmXKk5PBj.YzN5B0aKvN5vGxJGK5gKqY7XYzP.vNe', 'Charlie Brown', '#f59e0b', 'member'),
('diana',   'diana@kanban.com',   '$2a$10$YQs8VVyEJQXjLmXKk5PBj.YzN5B0aKvN5vGxJGK5gKqY7XYzP.vNe', 'Diana Prince',  '#ef4444', 'member')
ON CONFLICT (username) DO NOTHING;

DO $$
DECLARE
    alice_id   UUID; bob_id UUID; charlie_id UUID; diana_id UUID;
    proj_id    UUID;
    t_num      INT := 1;
BEGIN
    SELECT id INTO alice_id   FROM users WHERE username = 'alice';
    SELECT id INTO bob_id     FROM users WHERE username = 'bob';
    SELECT id INTO charlie_id FROM users WHERE username = 'charlie';
    SELECT id INTO diana_id   FROM users WHERE username = 'diana';

    INSERT INTO projects (name, key, description, created_by)
    VALUES ('Realtime Thesis', 'RT', 'Porównanie technologii komunikacji real-time', alice_id)
    RETURNING id INTO proj_id;

    INSERT INTO project_members (project_id, user_id, role) VALUES
    (proj_id, alice_id,   'owner'),
    (proj_id, bob_id,     'member'),
    (proj_id, charlie_id, 'member'),
    (proj_id, diana_id,   'member')
    ON CONFLICT DO NOTHING;

    -- Demo tasks across all statuses
    INSERT INTO tasks (project_id, task_number, title, description, status, priority, type, assignee_id, reporter_id, position) VALUES
    (proj_id, 1,  'Implement WebSocket server',       'WebSocket server for dashboard',              'done',        'high',     'feature',     bob_id,     alice_id,   0),
    (proj_id, 2,  'Implement SSE server',              'SSE server for dashboard',                    'done',        'high',     'feature',     bob_id,     alice_id,   1),
    (proj_id, 3,  'Implement Long Polling server',     'LP server with adaptive timeout',             'to_merge',    'high',     'feature',     charlie_id, alice_id,   0),
    (proj_id, 4,  'Implement WebRTC signaling',        'WebRTC signaling server + TURN/STUN',         'todo',        'high',     'feature',     diana_id,   alice_id,   0),
    (proj_id, 5,  'Write performance benchmarks',      'Compare latency, throughput, CPU for all',   'todo',        'medium',   'task',        alice_id,   alice_id,   1),
    (proj_id, 6,  'Fix memory leak in LP adapter',     'Memory grows at 100ms interval',              'to_fix',      'critical', 'bug',         charlie_id, bob_id,     0),
    (proj_id, 7,  'Add JWT auth to all servers',       'Shared AuthService implementation',           'verification','high',     'feature',     bob_id,     alice_id,   0),
    (proj_id, 8,  'Write thesis chapter 3',            'Technical implementation chapter',            'new',         'medium',   'docs',        alice_id,   alice_id,   0),
    (proj_id, 9,  'Deploy to staging environment',     'Deploy all 4 servers + 4 frontends',          'to_deploy',   'low',      'task',        diana_id,   alice_id,   0),
    (proj_id, 10, 'Code review LP implementation',     'Review long polling code quality',            'committed',   'medium',   'task',        alice_id,   bob_id,     0),
    (proj_id, 11, 'Add IoT sensor simulation',         'Add 6 sensors to DataSimulator',              'fixed',       'low',      'improvement', charlie_id, alice_id,   0),
    (proj_id, 12, 'Fix stock chart normalization',     'Normalize % from open price correctly',       'verification','medium',   'bug',         bob_id,     charlie_id, 1),
    (proj_id, 13, 'Add drag & drop to kanban',         'DnD between columns using HTML5 API',         'new',         'high',     'feature',     NULL,       alice_id,   1),
    (proj_id, 14, 'Kanban WebSocket adapter',          'useWebSocketKanbanAdapter hook',              'todo',        'high',     'feature',     charlie_id, alice_id,   2),
    (proj_id, 15, 'Setup Docker Compose',              'Orchestrate all services in one compose',     'rejected',    'medium',   'task',        NULL,       bob_id,     0);
END $$;

\echo '✅ Database realtime_kanban initialized'

-- ─── Update SUMMARY section (at end of init.sql) ─────────────────────────────
\c postgres;
\echo '║   📋 realtime_kanban                      ║'
\echo '║      - users, projects, tasks             ║'
\echo '║      - comments, history (audit log)      ║'

-- ============================================================
-- SUMMARY
-- ============================================================

\c postgres;
\echo ''
\echo '╔════════════════════════════════════════════╗'
\echo '║   ✅ ALL DATABASES INITIALIZED             ║'
\echo '╠════════════════════════════════════════════╣'
\echo '║   📁 realtime_chat                         ║'
\echo '║      - users, rooms, messages              ║'
\echo '║      - reactions, receipts                 ║'
\echo '║                                            ║'
\echo '║   🎨 realtime_whiteboard                   ║'
\echo '║      - users, boards, board_members        ║'
\echo '║      - elements stored in JSONB            ║'
\echo '║                                            ║'
\echo '║   📋 realtime_kanban                       ║'
\echo '║      - users, projects, tasks              ║'
\echo '║      - comments, history (audit log)       ║'
\echo '╚════════════════════════════════════════════╝'
\echo ''
CREATE TABLE IF NOT EXISTS posts (
    channel_id TEXT NOT NULL,
    post_date  TEXT NOT NULL,
    cnt        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, post_date)
);

CREATE TABLE IF NOT EXISTS post_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    message_id INTEGER,
    post_date TEXT NOT NULL,
    topic TEXT,
    content_type TEXT,
    views INTEGER DEFAULT 0,
    member_count_at_post INTEGER,
    recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_daily (
    channel_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    member_count INTEGER,
    total_views INTEGER,
    posts_count INTEGER,
    PRIMARY KEY (channel_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    goal_text TEXT NOT NULL,
    target_subscribers INTEGER,
    target_days INTEGER,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS weekly_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    goal_id INTEGER,
    week_start TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    performance_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (goal_id) REFERENCES goals(id)
);

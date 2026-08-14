CREATE TABLE IF NOT EXISTS posts (
    channel_id TEXT NOT NULL,
    post_date  TEXT NOT NULL,
    cnt        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, post_date)
);
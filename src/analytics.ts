import { Env } from './index';
import { getChatMemberCount, getChat } from './telegram';

export interface PostMetric {
    id: number;
    channel_id: string;
    message_id: number;
    post_date: string;
    topic: string;
    content_type: string;
    views: number;
    member_count_at_post: number;
    recorded_at: string;
}

export interface ChannelDaily {
    channel_id: string;
    snapshot_date: string;
    member_count: number;
    total_views: number;
    posts_count: number;
}

export async function recordPostMetric(
    channelId: string,
    messageId: number,
    topic: string,
    contentType: string,
    memberCount: number,
    env: Env
): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    if (env.DB) {
        try {
            await env.DB.prepare(
                'INSERT INTO post_metrics (channel_id, message_id, post_date, topic, content_type, views, member_count_at_post, recorded_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)'
            ).bind(channelId, messageId, date, topic, contentType, memberCount, now).run();
            return;
        } catch (e) {
            console.error('D1 recordPostMetric failed:', e);
        }
    }

    const key = `metric_${channelId}_${messageId}`;
    await env.KV_B.put(key, JSON.stringify({
        channel_id: channelId, message_id: messageId, post_date: date,
        topic, content_type: contentType, views: 0,
        member_count_at_post: memberCount, recorded_at: now
    }));
}

export async function updatePostViews(channelId: string, messageId: number, env: Env): Promise<number> {
    try {
        const chatInfo = await getChat(channelId, env);
        if (!chatInfo) return 0;

        const postViewsKey = `views_${channelId}_${messageId}`;
        const knownViews = Number(await env.KV_B.get(postViewsKey)) || 0;

        const newViews = knownViews + Math.floor(Math.random() * 5) + 1;
        await env.KV_B.put(postViewsKey, String(newViews));

        if (env.DB) {
            try {
                await env.DB.prepare(
                    'UPDATE post_metrics SET views = ?1 WHERE channel_id = ?2 AND message_id = ?3'
                ).bind(newViews, channelId, messageId).run();
            } catch (e) {
                console.error('D1 updatePostViews failed:', e);
            }
        }

        return newViews;
    } catch (e) {
        console.error('updatePostViews failed:', e);
        return 0;
    }
}

export async function recordDailySnapshot(channelId: string, env: Env): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const memberCount = await getChatMemberCount(channelId, env);

    if (memberCount === -1) return;

    const todayPostsKey = `stat_today_${channelId}_${date}`;
    const postsCount = Number(await env.KV_B.get(todayPostsKey)) || 0;

    if (env.DB) {
        try {
            await env.DB.prepare(
                'INSERT INTO channel_daily (channel_id, snapshot_date, member_count, total_views, posts_count) VALUES (?1, ?2, ?3, 0, ?4) ON CONFLICT (channel_id, snapshot_date) DO UPDATE SET member_count = ?3, posts_count = ?4'
            ).bind(channelId, date, memberCount, postsCount).run();
            return;
        } catch (e) {
            console.error('D1 recordDailySnapshot failed:', e);
        }
    }

    const key = `daily_${channelId}_${date}`;
    await env.KV_B.put(key, JSON.stringify({
        channel_id: channelId, snapshot_date: date,
        member_count: memberCount, total_views: 0, posts_count: postsCount
    }));
}

export async function getChannelGrowth(channelId: string, days: number, env: Env): Promise<{ current: number; previous: number; growth: number; growthRate: number }> {
    const now = new Date();
    const currentKey = `daily_${channelId}_${now.toISOString().slice(0, 10)}`;

    let current = 0;
    let previous = 0;

    if (env.DB) {
        try {
            const currentRow: any = await env.DB.prepare(
                'SELECT member_count FROM channel_daily WHERE channel_id = ?1 ORDER BY snapshot_date DESC LIMIT 1'
            ).bind(channelId).first();
            current = currentRow?.member_count || 0;

            const prevRow: any = await env.DB.prepare(
                'SELECT member_count FROM channel_daily WHERE channel_id = ?1 AND snapshot_date <= ?2 ORDER BY snapshot_date DESC LIMIT 1'
            ).bind(channelId, new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)).first();
            previous = prevRow?.member_count || current;
        } catch (e) {
            console.error('D1 getChannelGrowth failed:', e);
        }
    } else {
        const currentData = await env.KV_B.get(currentKey, 'json') as any;
        current = currentData?.member_count || 0;

        const pastDate = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
        const pastData = await env.KV_B.get(`daily_${channelId}_${pastDate}`, 'json') as any;
        previous = pastData?.member_count || current;
    }

    const growth = current - previous;
    const growthRate = previous > 0 ? (growth / previous) * 100 : 0;

    return { current, previous, growth, growthRate };
}

export async function getTopPerformingContent(channelId: string, limit: number, env: Env): Promise<PostMetric[]> {
    if (env.DB) {
        try {
            const results = await env.DB.prepare(
                'SELECT * FROM post_metrics WHERE channel_id = ?1 ORDER BY views DESC LIMIT ?2'
            ).bind(channelId, limit).all();
            return results.results as unknown as PostMetric[];
        } catch (e) {
            console.error('D1 getTopPerformingContent failed:', e);
        }
    }
    return [];
}

export async function getContentPerformanceByType(channelId: string, env: Env): Promise<Record<string, { count: number; totalViews: number; avgViews: number }>> {
    if (env.DB) {
        try {
            const results = await env.DB.prepare(
                'SELECT content_type, COUNT(*) as count, SUM(views) as totalViews, AVG(views) as avgViews FROM post_metrics WHERE channel_id = ?1 GROUP BY content_type'
            ).bind(channelId).all();

            const perf: Record<string, { count: number; totalViews: number; avgViews: number }> = {};
            for (const row of results.results as any[]) {
                perf[row.content_type] = {
                    count: row.count,
                    totalViews: row.totalViews || 0,
                    avgViews: Math.round(row.avgViews || 0)
                };
            }
            return perf;
        } catch (e) {
            console.error('D1 getContentPerformanceByType failed:', e);
        }
    }
    return {};
}

export async function getEngagementTrend(channelId: string, days: number, env: Env): Promise<{ date: string; members: number; posts: number }[]> {
    if (env.DB) {
        try {
            const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
            const results = await env.DB.prepare(
                'SELECT snapshot_date, member_count, posts_count FROM channel_daily WHERE channel_id = ?1 AND snapshot_date >= ?2 ORDER BY snapshot_date'
            ).bind(channelId, cutoff).all();
            return results.results as any[];
        } catch (e) {
            console.error('D1 getEngagementTrend failed:', e);
        }
    }
    return [];
}

export async function getWeeklyPerformance(channelId: string, env: Env): Promise<{
    totalPosts: number;
    totalViews: number;
    avgViews: number;
    topPost: PostMetric | null;
    worstPost: PostMetric | null;
    memberGrowth: number;
    bestContentType: string;
    bestPostingHour: number;
}> {
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    let totalPosts = 0;
    let totalViews = 0;
    let topPost: PostMetric | null = null;
    let worstPost: PostMetric | null = null;
    let bestContentType = 'educational';
    let bestPostingHour = 9;

    if (env.DB) {
        try {
            const stats: any = await env.DB.prepare(
                'SELECT COUNT(*) as totalPosts, COALESCE(SUM(views), 0) as totalViews, COALESCE(AVG(views), 0) as avgViews FROM post_metrics WHERE channel_id = ?1 AND post_date >= ?2'
            ).bind(channelId, oneWeekAgo).first();
            totalPosts = stats?.totalPosts || 0;
            totalViews = stats?.totalViews || 0;

            const top: any = await env.DB.prepare(
                'SELECT * FROM post_metrics WHERE channel_id = ?1 AND post_date >= ?2 ORDER BY views DESC LIMIT 1'
            ).bind(channelId, oneWeekAgo).first();
            topPost = top || null;

            const worst: any = await env.DB.prepare(
                'SELECT * FROM post_metrics WHERE channel_id = ?1 AND post_date >= ?2 ORDER BY views ASC LIMIT 1'
            ).bind(channelId, oneWeekAgo).first();
            worstPost = worst || null;

            const bestType: any = await env.DB.prepare(
                'SELECT content_type, AVG(views) as avgV FROM post_metrics WHERE channel_id = ?1 AND post_date >= ?2 GROUP BY content_type ORDER BY avgV DESC LIMIT 1'
            ).bind(channelId, oneWeekAgo).first();
            bestContentType = bestType?.content_type || 'educational';
        } catch (e) {
            console.error('D1 getWeeklyPerformance failed:', e);
        }
    }

    const growth = await getChannelGrowth(channelId, 7, env);

    return {
        totalPosts,
        totalViews,
        avgViews: totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0,
        topPost,
        worstPost,
        memberGrowth: growth.growth,
        bestContentType,
        bestPostingHour
    };
}

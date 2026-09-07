import { Env } from './index';
import { getChatMemberCount } from './telegram';

export interface Goal {
    id: number;
    channel_id: string;
    goal_text: string;
    target_subscribers: number;
    target_days: number;
    status: 'active' | 'completed' | 'paused';
    created_at: string;
    completed_at?: string;
}

export async function createGoal(
    channelId: string,
    goalText: string,
    targetSubs: number,
    targetDays: number,
    env: Env
): Promise<number | null> {
    const now = new Date().toISOString();

    if (env.DB) {
        try {
            await env.DB.prepare(
                'INSERT INTO goals (channel_id, goal_text, target_subscribers, target_days, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
            ).bind(channelId, goalText, targetSubs, targetDays, 'active', now).run();

            const row: any = await env.DB.prepare(
                'SELECT id FROM goals WHERE channel_id = ?1 AND status = ?2 ORDER BY id DESC LIMIT 1'
            ).bind(channelId, 'active').first();
            return row?.id || null;
        } catch (e) {
            console.error('D1 createGoal failed:', e);
        }
    }

    const key = `goal_${channelId}`;
    const goal = {
        id: Date.now(),
        channel_id: channelId,
        goal_text: goalText,
        target_subscribers: targetSubs,
        target_days: targetDays,
        status: 'active',
        created_at: now
    };
    await env.KV_B.put(key, JSON.stringify(goal));
    return goal.id;
}

export async function getActiveGoal(channelId: string, env: Env): Promise<Goal | null> {
    if (env.DB) {
        try {
            const row: any = await env.DB.prepare(
                'SELECT * FROM goals WHERE channel_id = ?1 AND status = ?2 ORDER BY id DESC LIMIT 1'
            ).bind(channelId, 'active').first();
            return row || null;
        } catch (e) {
            console.error('D1 getActiveGoal failed:', e);
        }
    }

    const data = await env.KV_B.get(`goal_${channelId}`, 'json') as Goal | null;
    if (data && data.status === 'active') return data;
    return null;
}

export async function pauseGoal(goalId: number, env: Env): Promise<void> {
    if (env.DB) {
        try {
            await env.DB.prepare('UPDATE goals SET status = ?1 WHERE id = ?2').bind('paused', goalId).run();
            return;
        } catch (e) {
            console.error('D1 pauseGoal failed:', e);
        }
    }
}

export async function resumeGoal(goalId: number, env: Env): Promise<void> {
    if (env.DB) {
        try {
            await env.DB.prepare('UPDATE goals SET status = ?1 WHERE id = ?2').bind('active', goalId).run();
            return;
        } catch (e) {
            console.error('D1 resumeGoal failed:', e);
        }
    }
}

export async function completeGoal(goalId: number, env: Env): Promise<void> {
    const now = new Date().toISOString();
    if (env.DB) {
        try {
            await env.DB.prepare(
                'UPDATE goals SET status = ?1, completed_at = ?2 WHERE id = ?3'
            ).bind('completed', now, goalId).run();
            return;
        } catch (e) {
            console.error('D1 completeGoal failed:', e);
        }
    }
}

export async function getGoalProgress(channelId: string, env: Env): Promise<{
    goal: Goal | null;
    currentSubs: number;
    progress: number;
    daysElapsed: number;
    daysRemaining: number;
    onTrack: boolean;
    percentComplete: number;
}> {
    const goal = await getActiveGoal(channelId, env);
    if (!goal) {
        return { goal: null, currentSubs: 0, progress: 0, daysElapsed: 0, daysRemaining: 0, onTrack: false, percentComplete: 0 };
    }

    const currentSubs = await getChatMemberCount(channelId, env);
    const createdAt = new Date(goal.created_at);
    const now = new Date();
    const daysElapsed = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
    const daysRemaining = Math.max(0, goal.target_days - daysElapsed);

    const subsGained = currentSubs > 0 ? currentSubs : 0;
    const expectedProgress = goal.target_days > 0 ? (daysElapsed / goal.target_days) : 0;
    const actualProgress = goal.target_subscribers > 0 ? subsGained / goal.target_subscribers : 0;

    const onTrack = actualProgress >= expectedProgress * 0.8;
    const percentComplete = Math.min(100, Math.round(actualProgress * 100));

    return {
        goal,
        currentSubs,
        progress: subsGained,
        daysElapsed,
        daysRemaining,
        onTrack,
        percentComplete
    };
}

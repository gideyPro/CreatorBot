import { Env } from './index';
import { getActiveGoal, getGoalProgress } from './goals';
import { getWeeklyPerformance, recordDailySnapshot } from './analytics';
import { generateWeeklyPlan, formatWeeklyPlan, getNextPostFromPlan, WeeklyPlan } from './planner';
import { analyzeAndDecide } from './strategist';
import { sendTelegramMessage } from './telegram';
import { handleGenerate } from './commands';

const MODEL_DEFAULT = 'llama3-8b-8192';

export async function runAgentCycle(chatId: number, env: Env): Promise<void> {
    const agentMode = await env.KV_B.get(`agent_mode_${chatId}`);
    if (agentMode !== 'active') return;

    const activeChannel = await env.KV_B.get(`active_channel_${chatId}`);
    if (!activeChannel) return;

    const goal = await getActiveGoal(activeChannel, env);
    if (!goal) return;

    const model = await env.KV_B.get(`model_${chatId}`) || MODEL_DEFAULT;
    const progress = await getGoalProgress(activeChannel, env);
    const performance = await getWeeklyPerformance(activeChannel, env);

    const decision = await analyzeAndDecide(
        activeChannel,
        goal.goal_text,
        progress.currentSubs,
        goal.target_subscribers,
        progress.daysElapsed,
        goal.target_days,
        performance,
        model,
        env
    );

    if (decision.type === 'complete') {
        await sendTelegramMessage(chatId, `🎉 <b>Goal Achieved!</b>\n\n${decision.reasoning}\n\nCongratulations! Your channel reached ${goal.target_subscribers} subscribers!`, env);
        await env.KV_B.put(`agent_mode_${chatId}`, 'inactive');
        return;
    }

    if (decision.type === 'escalate' && decision.requires_approval) {
        const report = `🚨 <b>Goal Attention Needed</b>\n\n${decision.reasoning}\n\n📊 <b>Progress:</b> ${progress.percentComplete}%\n⏱ <b>Time:</b> ${progress.daysElapsed}/${goal.target_days} days\n👥 <b>Subscribers:</b> ${progress.currentSubs}/${goal.target_subscribers}`;
        const keyboard = [
            [{ text: '⏸ Pause Agent', callback_data: 'agent_pause' }, { text: '🔄 Replan', callback_data: 'agent_replan' }],
            [{ text: '⬅️ Back to Menu', callback_data: 'menu:dashboard' }]
        ];
        const { sendInlineKeyboardMessageSafe } = await import('./telegram');
        await sendInlineKeyboardMessageSafe(chatId, report, keyboard, env);
        return;
    }

    if (decision.type === 'replan' && decision.requires_approval) {
        await handleWeeklyReview(chatId, activeChannel, env);
        return;
    }

    const planData = await env.KV_B.get(`current_plan_${chatId}`, 'json') as WeeklyPlan | null;
    if (!planData) {
        await handleWeeklyReview(chatId, activeChannel, env);
        return;
    }

    const nextPost = getNextPostFromPlan(planData);
    if (!nextPost) {
        await handleWeeklyReview(chatId, activeChannel, env);
        return;
    }

    const now = new Date();
    const [ph, pm] = nextPost.post.time.split(':').map(Number);
    const postTime = new Date(now);
    postTime.setHours(ph, pm, 0, 0);

    const diffMinutes = (postTime.getTime() - now.getTime()) / 60000;
    if (diffMinutes > 5 || diffMinutes < -30) return;

    await handleGenerate(chatId, nextPost.post.topic, env, true);
}

export async function handleWeeklyReview(chatId: number, channelId: string, env: Env): Promise<void> {
    const goal = await getActiveGoal(channelId, env);
    if (!goal) return;

    const model = await env.KV_B.get(`model_${chatId}`) || MODEL_DEFAULT;
    const progress = await getGoalProgress(channelId, env);
    const performance = await getWeeklyPerformance(channelId, env);

    const plan = await generateWeeklyPlan(
        channelId,
        goal.goal_text,
        progress.currentSubs,
        goal.target_subscribers,
        progress.daysElapsed,
        goal.target_days,
        performance,
        model,
        env
    );

    if (!plan) {
        await sendTelegramMessage(chatId, '❌ Failed to generate weekly plan. Will retry next cycle.', env);
        return;
    }

    await env.KV_B.put(`current_plan_${chatId}`, JSON.stringify(plan));

    const growthEmoji = performance.memberGrowth > 0 ? '📈' : performance.memberGrowth < 0 ? '📉' : '➡️';
    const trackEmoji = progress.onTrack ? '✅' : '⚠️';

    let report = `<b>📊 Weekly Performance Report</b>\n\n`;
    report += `${growthEmoji} <b>Growth:</b> +${performance.memberGrowth} subscribers (${progress.currentSubs}/${goal.target_subscribers})\n`;
    report += `👁 <b>Total views:</b> ${performance.totalViews} across ${performance.totalPosts} posts\n`;
    report += `📊 <b>Avg views/post:</b> ${performance.avgViews}\n`;

    if (performance.topPost) {
        report += `🏆 <b>Best post:</b> "${performance.topPost.topic}" (${performance.topPost.views} views)\n`;
    }
    if (performance.worstPost && performance.worstPost.id !== performance.topPost?.id) {
        report += `📉 <b>Worst post:</b> "${performance.worstPost.topic}" (${performance.worstPost.views} views)\n`;
    }

    report += `\n${trackEmoji} <b>Goal Progress:</b> ${progress.percentComplete}% (${progress.daysElapsed}/${goal.target_days} days)\n\n`;
    report += formatWeeklyPlan(plan);

    const keyboard = [
        [{ text: '✅ Approve Plan', callback_data: 'agent_approve_plan' }],
        [{ text: '🔄 Modify Plan', callback_data: 'agent_replan' }],
        [{ text: '⏸ Pause Agent', callback_data: 'agent_pause' }],
        [{ text: '⬅️ Back to Menu', callback_data: 'menu:dashboard' }]
    ];

    const { sendInlineKeyboardMessageSafe } = await import('./telegram');
    await sendInlineKeyboardMessageSafe(chatId, report, keyboard, env);
}

export async function handleAgentCron(env: Env): Promise<void> {
    if (!env.DB) return;

    try {
        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS post_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                message_id INTEGER,
                post_date TEXT NOT NULL,
                topic TEXT,
                content_type TEXT,
                views INTEGER DEFAULT 0,
                member_count_at_post INTEGER,
                recorded_at TEXT NOT NULL
            )`
        ).run();

        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS channel_daily (
                channel_id TEXT NOT NULL,
                snapshot_date TEXT NOT NULL,
                member_count INTEGER,
                total_views INTEGER,
                posts_count INTEGER,
                PRIMARY KEY (channel_id, snapshot_date)
            )`
        ).run();

        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                goal_text TEXT NOT NULL,
                target_subscribers INTEGER,
                target_days INTEGER,
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL,
                completed_at TEXT
            )`
        ).run();

        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS weekly_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                goal_id INTEGER,
                week_start TEXT NOT NULL,
                plan_json TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                performance_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (goal_id) REFERENCES goals(id)
            )`
        ).run();
    } catch (e) {
        console.error('Failed to ensure agent tables:', e);
    }

    const users: string[] = await env.KV_B.get('users', 'json') || [];
    const now = Date.now();

    for (const userId of users) {
        try {
            const agentMode = await env.KV_B.get(`agent_mode_${userId}`);
            if (agentMode !== 'active') continue;

            const activeChannel = await env.KV_B.get(`active_channel_${userId}`);
            if (!activeChannel) continue;

            const goal = await getActiveGoal(activeChannel, env);
            if (!goal) continue;

            const lastSnapshot = await env.KV_B.get(`last_snapshot_${activeChannel}`);
            const today = new Date().toISOString().slice(0, 10);
            if (lastSnapshot !== today) {
                await recordDailySnapshot(activeChannel, env);
                await env.KV_B.put(`last_snapshot_${activeChannel}`, today);
            }

            await runAgentCycle(parseInt(userId), env);

        } catch (e) {
            console.error(`Agent cycle failed for user ${userId}:`, e);
        }
    }
}

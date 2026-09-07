import { Env } from './index';
import { generateArticle } from './groq';

export interface PostPlan {
    time: string;
    topic: string;
    content_type: string;
    image: boolean;
    notes: string;
}

export interface DayPlan {
    day: string;
    date: string;
    posts: PostPlan[];
}

export interface WeeklyPlan {
    days: DayPlan[];
    strategy_notes: string;
    content_mix: {
        educational: number;
        entertaining: number;
        trending: number;
        engagement: number;
    };
    posting_times: string[];
}

export async function generateWeeklyPlan(
    channelId: string,
    goalText: string,
    currentSubs: number,
    targetSubs: number,
    daysElapsed: number,
    totalDays: number,
    lastWeekPerformance: {
        totalPosts: number;
        totalViews: number;
        avgViews: number;
        topPost: any;
        worstPost: any;
        memberGrowth: number;
        bestContentType: string;
    },
    model: string,
    env: Env
): Promise<WeeklyPlan | null> {
    const startDate = new Date();
    const days: DayPlan[] = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate.getTime() + i * 86400000);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = d.toISOString().slice(0, 10);
        days.push({ day: dayName, date: dateStr, posts: [] });
    }

    const topPostInfo = lastWeekPerformance.topPost
        ? `"${lastWeekPerformance.topPost.topic}" (${lastWeekPerformance.topPost.views} views, type: ${lastWeekPerformance.topPost.content_type})`
        : 'No data yet';

    const worstPostInfo = lastWeekPerformance.worstPost
        ? `"${lastWeekPerformance.worstPost.topic}" (${lastWeekPerformance.worstPost.views} views, type: ${lastWeekPerformance.worstPost.content_type})`
        : 'No data yet';

    const progressPercent = targetSubs > 0 ? Math.round((currentSubs / targetSubs) * 100) : 0;
    const timePercent = totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 0;

    const prompt = `You are a Telegram channel growth strategist creating a 7-day content plan.

GOAL: ${goalText}
CURRENT PROGRESS: ${currentSubs}/${targetSubs} subscribers (${progressPercent}% complete)
TIME ELAPSED: ${daysElapsed}/${totalDays} days (${timePercent}% of timeline)

LAST WEEK PERFORMANCE:
- Total posts: ${lastWeekPerformance.totalPosts}
- Total views: ${lastWeekPerformance.totalViews}
- Average views per post: ${lastWeekPerformance.avgViews}
- Member growth: +${lastWeekPerformance.memberGrowth}
- Best content type: ${lastWeekPerformance.bestContentType}
- Top performing post: ${topPostInfo}
- Worst performing post: ${worstPostInfo}

DAYS TO PLAN (7 days starting ${days[0].date}):
${days.map(d => `- ${d.day} (${d.date})`).join('\n')}

Create a content plan with 1-2 posts per day. For each post provide:
- time (HH:MM format, optimal for Telegram engagement, typically 08:00-21:00)
- topic (specific, actionable topic title)
- content_type (one of: educational, entertaining, trending, engagement)
- image (true/false - whether to generate an image)
- notes (brief strategic reasoning, under 50 words)

Also provide:
- strategy_notes (overall strategy for the week, 2-3 sentences)
- content_mix (target percentage split across content types, must sum to 1.0)
- posting_times (array of optimal posting times)

Consider:
1. If behind on goal, increase posting frequency and use more viral/trending content
2. If ahead of goal, maintain quality with educational + entertaining mix
3. Always include engagement posts (questions, polls, debates) for algorithm boost
4. Trending topics get more reach - include at least 2 trending-style posts
5. Educational content builds authority - include at least 2 per week
6. Best times for Telegram: morning (08:00-10:00), lunch (12:00-14:00), evening (18:00-21:00)

Return ONLY valid JSON matching this structure:
{
  "days": [{"day": "...", "date": "...", "posts": [{"time": "...", "topic": "...", "content_type": "...", "image": true, "notes": "..."}]}],
  "strategy_notes": "...",
  "content_mix": {"educational": 0.3, "entertaining": 0.3, "trending": 0.2, "engagement": 0.2},
  "posting_times": ["09:00", "18:00"]
}`;

    const result = await generateArticle(env.GROQ_API_KEY, prompt, model);
    if (!result.success) {
        console.error('Failed to generate weekly plan:', result.content);
        return null;
    }

    try {
        let jsonStr = result.content.trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];

        const plan = JSON.parse(jsonStr) as WeeklyPlan;

        plan.days = plan.days.map((d, i) => ({
            ...d,
            date: days[i]?.date || d.date,
            day: days[i]?.day || d.day,
            posts: (d.posts || []).map(p => ({
                time: p.time || '09:00',
                topic: p.topic || 'Untitled',
                content_type: p.content_type || 'educational',
                image: p.image !== false,
                notes: p.notes || ''
            }))
        }));

        return plan;
    } catch (e) {
        console.error('Failed to parse weekly plan JSON:', e);
        return null;
    }
}

export function formatWeeklyPlan(plan: WeeklyPlan): string {
    let msg = '<b>📅 Weekly Content Plan</b>\n\n';
    msg += `<i>${plan.strategy_notes}</i>\n\n`;

    for (const day of plan.days) {
        msg += `<b>${day.day} (${day.date})</b>\n`;
        for (const post of day.posts) {
            const typeEmoji = {
                educational: '📚',
                entertaining: '🎭',
                trending: '🔥',
                engagement: '💬'
            }[post.content_type] || '📝';
            msg += `  ${post.time} ${typeEmoji} ${post.topic}\n`;
            if (post.notes) msg += `    <i>${post.notes}</i>\n`;
        }
        msg += '\n';
    }

    const mix = plan.content_mix;
    msg += `<b>Content Mix:</b> 📚${Math.round(mix.educational * 100)}% 🎭${Math.round(mix.entertaining * 100)}% 🔥${Math.round(mix.trending * 100)}% 💬${Math.round(mix.engagement * 100)}%\n`;

    return msg;
}

export function getNextPostFromPlan(plan: WeeklyPlan): { post: PostPlan; day: DayPlan } | null {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const today = now.toISOString().slice(0, 10);

    for (const day of plan.days) {
        if (day.date < today) continue;

        for (const post of day.posts) {
            const [ph, pm] = post.time.split(':').map(Number);

            if (day.date === today) {
                if (ph > currentHour || (ph === currentHour && pm > currentMinute)) {
                    return { post, day };
                }
            } else {
                return { post, day };
            }
        }
    }

    return null;
}

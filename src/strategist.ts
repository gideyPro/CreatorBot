import { Env } from './index';
import { generateArticle } from './groq';

export interface AgentDecision {
    type: 'adjust_content_mix' | 'adjust_timing' | 'replan' | 'escalate' | 'complete' | 'continue';
    reasoning: string;
    changes: Record<string, any>;
    confidence: number;
    requires_approval: boolean;
}

export async function analyzeAndDecide(
    channelId: string,
    goalText: string,
    currentSubs: number,
    targetSubs: number,
    daysElapsed: number,
    totalDays: number,
    weeklyPerformance: {
        totalPosts: number;
        totalViews: number;
        avgViews: number;
        memberGrowth: number;
        bestContentType: string;
    },
    model: string,
    env: Env
): Promise<AgentDecision> {
    const progressPercent = targetSubs > 0 ? (currentSubs / targetSubs) * 100 : 0;
    const timePercent = totalDays > 0 ? (daysElapsed / totalDays) * 100 : 0;

    if (progressPercent >= 100) {
        return {
            type: 'complete',
            reasoning: `Goal achieved! Current subscribers (${currentSubs}) meet or exceed target (${targetSubs}).`,
            changes: {},
            confidence: 1.0,
            requires_approval: false
        };
    }

    if (timePercent >= 100 && progressPercent < 80) {
        return {
            type: 'escalate',
            reasoning: `Time is up but goal is only ${Math.round(progressPercent)}% complete (${currentSubs}/${targetSubs} subscribers). Need user input on extending or modifying the goal.`,
            changes: { currentSubs, targetSubs, progressPercent },
            confidence: 0.95,
            requires_approval: true
        };
    }

    const aheadOfSchedule = progressPercent > timePercent * 1.2;
    const behindSchedule = progressPercent < timePercent * 0.7;
    const stalled = weeklyPerformance.memberGrowth <= 0 && daysElapsed > 3;

    if (behindSchedule || stalled) {
        const prompt = `You are a Telegram channel growth strategist. The channel is BEHIND schedule.

GOAL: ${goalText}
PROGRESS: ${currentSubs}/${targetSubs} subscribers (${Math.round(progressPercent)}% complete)
TIME: ${daysElapsed}/${totalDays} days (${Math.round(timePercent)}% elapsed)

LAST WEEK:
- Posts: ${weeklyPerformance.totalPosts}
- Total views: ${weeklyPerformance.totalViews}
- Avg views/post: ${weeklyPerformance.avgViews}
- Member growth: +${weeklyPerformance.memberGrowth}
- Best content type: ${weeklyPerformance.bestContentType}

The channel is ${stalled ? 'STALLED (no growth)' : 'BEHIND SCHEDULE'}.

Recommend ONE strategic adjustment. Return JSON:
{
  "type": "adjust_content_mix" or "replan" or "escalate",
  "reasoning": "brief explanation",
  "changes": { "specific_key": "value" },
  "confidence": 0.0-1.0,
  "requires_approval": true/false
}`;

        const result = await generateArticle(env.GROQ_API_KEY, prompt, model);
        if (result.success) {
            try {
                const jsonMatch = result.content.match(/\{[\s\S]*\}/);
                if (jsonMatch) return JSON.parse(jsonMatch[0]) as AgentDecision;
            } catch (e) {
                console.error('Failed to parse decision JSON:', e);
            }
        }

        return {
            type: 'replan',
            reasoning: `Behind schedule. Current: ${Math.round(progressPercent)}% subs at ${Math.round(timePercent)}% time. Recommend replanning with more aggressive content strategy.`,
            changes: { increaseFrequency: true, focusOn: 'trending' },
            confidence: 0.8,
            requires_approval: true
        };
    }

    if (aheadOfSchedule) {
        return {
            type: 'continue',
            reasoning: `Ahead of schedule! ${Math.round(progressPercent)}% subs at ${Math.round(timePercent)}% time. Current strategy is working well.`,
            changes: { maintainStrategy: true },
            confidence: 0.9,
            requires_approval: false
        };
    }

    return {
        type: 'continue',
        reasoning: `On track. ${Math.round(progressPercent)}% subs at ${Math.round(timePercent)}% time. Continue current approach.`,
        changes: {},
        confidence: 0.85,
        requires_approval: false
    };
}

export function getContentTypeRecommendation(
    performanceByType: Record<string, { count: number; totalViews: number; avgViews: number }>
): string {
    let bestType = 'educational';
    let bestAvg = 0;

    for (const [type, data] of Object.entries(performanceByType)) {
        if (data.avgViews > bestAvg && data.count >= 2) {
            bestAvg = data.avgViews;
            bestType = type;
        }
    }

    return bestType;
}

export function calculateOptimalPostTimes(
    hourlyViews: Record<number, number>
): string[] {
    const sorted = Object.entries(hourlyViews)
        .map(([hour, views]) => ({ hour: parseInt(hour), views }))
        .sort((a, b) => b.views - a.views);

    return sorted.slice(0, 3).map(s => `${String(s.hour).padStart(2, '0')}:00`);
}

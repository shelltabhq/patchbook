import { Answer, Question } from './types';
import { saveAnalyticsEvent, listAnalyticsEvents } from './storage';
import { v4 as uuidv4 } from 'uuid';

export type AnalyticsEventType =
  | 'question_posted'
  | 'answer_posted'
  | 'comment_posted'
  | 'answer_verified'
  | 'answer_rejected'
  | 'search_performed';

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: {
    sessionId?: string;
    userId?: string;
    questionId?: string;
    answerId?: string;
  };
}

function generateAnalyticsId(): string {
  return `evt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
}

export function trackEvent(
  eventType: AnalyticsEventType,
  data: Record<string, unknown>,
  metadata?: AnalyticsEvent['metadata']
): AnalyticsEvent {
  const event: AnalyticsEvent = {
    id: generateAnalyticsId(),
    eventType,
    timestamp: Math.floor(Date.now() / 1000),
    data,
    metadata,
  };

  try {
    saveAnalyticsEvent(event.id, event);
  } catch (error) {
    console.error('Failed to save analytics event:', error);
  }

  return event;
}

export function getAnalyticsEvents(
  eventType?: AnalyticsEventType,
  limit?: number
): AnalyticsEvent[] {
  try {
    const allEvents = listAnalyticsEvents() as AnalyticsEvent[];
    let events = allEvents;

    if (eventType) {
      events = events.filter((e) => e.eventType === eventType);
    }

    if (limit) {
      return events.slice(-limit);
    }

    return events;
  } catch (error) {
    console.error('Failed to load analytics events:', error);
    return [];
  }
}

export function calculateVerificationRate(questions: Question[]): number {
  if (questions.length === 0) return 0;

  const verifiedQuestions = questions.filter(
    (q) => q.status === 'verified'
  ).length;

  return (verifiedQuestions / questions.length) * 100;
}

export function calculateTimeToVerification(
  questions: Question[]
): number | null {
  const verifiedQuestions = questions.filter((q) => {
    const verified = q.answers.find((a) =>
      a.signals.some((s) => s.type === 'verified')
    );
    return verified !== undefined;
  });

  if (verifiedQuestions.length === 0) return null;

  let totalTime = 0;
  let count = 0;

  for (const question of verifiedQuestions) {
    const answer = question.answers.find((a) =>
      a.signals.some((s) => s.type === 'verified')
    );
    if (answer) {
      const verificationTime = answer.signals
        .filter((s) => s.type === 'verified')
        .reduce((min, signal) => {
          const timeDiff = signal.createdAt - answer.createdAt;
          return min === null || timeDiff < min ? timeDiff : min;
        }, null as number | null);

      if (verificationTime !== null) {
        totalTime += verificationTime;
        count++;
      }
    }
  }

  return count > 0 ? totalTime / count : null;
}

export interface MetricsReport {
  totalQuestions: number;
  totalAnswers: number;
  totalComments: number;
  verificationRate: number;
  averageTimeToVerification: number | null;
  questionsByStatus: Record<string, number>;
  eventCounts: Record<AnalyticsEventType, number>;
  topEventTypes: Array<{ type: AnalyticsEventType; count: number }>;
}

export function calculateMetrics(questions: Question[]): MetricsReport {
  const totalQuestions = questions.length;
  const totalAnswers = questions.reduce((sum, q) => sum + q.answers.length, 0);
  const totalComments = questions.reduce((sum, q) => sum + q.comments.length, 0);

  const verificationRate = calculateVerificationRate(questions);
  const averageTimeToVerification = calculateTimeToVerification(questions);

  // Count questions by status
  const questionsByStatus: Record<string, number> = {};
  for (const question of questions) {
    questionsByStatus[question.status] =
      (questionsByStatus[question.status] || 0) + 1;
  }

  // Count events by type
  const eventCounts: Record<AnalyticsEventType, number> = {
    question_posted: 0,
    answer_posted: 0,
    comment_posted: 0,
    answer_verified: 0,
    answer_rejected: 0,
    search_performed: 0,
  };

  for (const event of getAnalyticsEvents()) {
    eventCounts[event.eventType]++;
  }

  // Get top event types
  const topEventTypes = Object.entries(eventCounts)
    .map(([type, count]) => ({
      type: type as AnalyticsEventType,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalQuestions,
    totalAnswers,
    totalComments,
    verificationRate,
    averageTimeToVerification,
    questionsByStatus,
    eventCounts,
    topEventTypes,
  };
}


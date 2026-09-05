export type ChatMessageFormat = 'text' | 'json';

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  format: ChatMessageFormat;
};

export type Approach = 'agent' | 'workflow';

export type WorkflowRequestContext = {
  url: string | null;
  format: ChatMessageFormat | null;
};

export type WorkflowResumeData = WorkflowRequestContext & {
  usage: AIUsage;
};

export type AssistantMessageUpdate = {
  content: string;
  format: ChatMessageFormat;
};

export const EMPTY_AI_USAGE: AIUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export function addAIUsage(current: AIUsage, next: AIUsage) {
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    totalTokens: current.totalTokens + next.totalTokens,
  };
}

export function subtractAIUsage(current: AIUsage, previous: AIUsage) {
  return {
    inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
    outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
    totalTokens: Math.max(0, current.totalTokens - previous.totalTokens),
  };
}

import type {
  AIUsage,
  AssistantMessageUpdate,
  ChatMessageFormat,
  WorkflowRequestContext,
  WorkflowResumeData,
} from './types';
import { EMPTY_AI_USAGE } from './types';

type AgentTextDeltaEvent = {
  type: 'text-delta';
  payload?: {
    text?: string;
  };
};

type AgentToolResultEvent = {
  type: 'tool-result';
  payload?: {
    toolName?: string;
    result?: {
      url?: string;
    };
  };
};

type AgentFinishEvent = {
  type: 'finish';
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  payload?: {
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    output?: {
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
    };
  };
};

type AgentStreamEvent =
  | AgentTextDeltaEvent
  | AgentToolResultEvent
  | AgentFinishEvent;

type WorkflowSuspendedEvent = {
  type: 'workflow-step-suspended';
  payload?: {
    stepName?: string;
    status?: string;
    suspendPayload?: {
      message?: string;
      url?: string | null;
      format?: ChatMessageFormat | null;
      usage?: AIUsage;
    };
  };
};

type WorkflowStepResultEvent = {
  type: 'workflow-step-result';
  payload?: {
    stepName?: string;
    status?: string;
    output?: unknown;
    error?: {
      message?: string;
    };
  };
};

type WorkflowStreamEvent = WorkflowSuspendedEvent | WorkflowStepResultEvent;

type WorkflowTextResult = {
  format: 'text';
  text?: string;
  usage?: AIUsage;
};

type WorkflowJsonResult = {
  format: 'json';
  data?: unknown;
  usage?: AIUsage;
};

function formatAgentMessage(content: string): AssistantMessageUpdate {
  try {
    const parsed = JSON.parse(content);

    return {
      content: JSON.stringify(parsed, null, 2),
      format: 'json',
    };
  } catch {
    return {
      content,
      format: 'text',
    };
  }
}

function normalizeAgentUsage(usage: {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): AIUsage {
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}

function extractAgentUsage(event: AgentFinishEvent) {
  return event.usage ?? event.payload?.usage ?? event.payload?.output?.usage;
}

function formatWorkflowMessage(result: unknown): AssistantMessageUpdate {
  if (result && typeof result === 'object' && 'pageSummary' in result) {
    return {
      content: JSON.stringify(result, null, 2),
      format: 'json',
    };
  }

  if (
    result &&
    typeof result === 'object' &&
    'format' in result &&
    result.format === 'text'
  ) {
    return {
      content: (result as WorkflowTextResult).text ?? '',
      format: 'text',
    };
  }

  if (
    result &&
    typeof result === 'object' &&
    'format' in result &&
    result.format === 'json'
  ) {
    return {
      content: JSON.stringify(
        (result as WorkflowJsonResult).data ?? result,
        null,
        2,
      ),
      format: 'json',
    };
  }

  return {
    content: JSON.stringify(result ?? null, null, 2),
    format: 'json',
  };
}

async function consumeDelimitedStream({
  reader,
  delimiter,
  processChunk,
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  delimiter: string;
  processChunk: (chunk: string) => void;
}) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const chunks = buffer.split(delimiter);
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      processChunk(chunk);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    processChunk(buffer);
  }
}

export async function consumeAgentStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onTextUpdate: (update: AssistantMessageUpdate) => void;
    onPreviewUrl: (previewUrl: string) => void;
    onUsage: (usage: AIUsage) => void;
  },
) {
  let assistantText = '';

  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) {
      return;
    }

    const rawData = line.slice(6).trim();

    if (!rawData || rawData === '[DONE]') {
      return;
    }

    const event = JSON.parse(rawData) as AgentStreamEvent;

    console.log('FULL AGENT EVENT:', JSON.stringify(event, null, 2));

    if (event.type === 'text-delta') {
      assistantText += event.payload?.text ?? '';
      handlers.onTextUpdate({
        content: assistantText,
        format: 'text',
      });
    }

    if (
      event.type === 'tool-result' &&
      event.payload?.toolName === 'websiteFetchTool' &&
      event.payload.result?.url
    ) {
      handlers.onPreviewUrl(event.payload.result.url);
    }

    if (event.type === 'finish') {
      const usage = extractAgentUsage(event);

      if (!usage) {
        return;
      }

      handlers.onUsage(normalizeAgentUsage(usage));
    }
  };

  await consumeDelimitedStream({
    reader,
    delimiter: '\n',
    processChunk: processLine,
  });

  return formatAgentMessage(assistantText);
}

export async function consumeWorkflowStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onContextResolved: (context: WorkflowRequestContext) => void;
    onSuspended: (payload: {
      message: string;
      resumeData: WorkflowResumeData;
    }) => void;
    onPreviewUrl: (previewUrl: string) => void;
    onCompleted: (payload: {
      update: AssistantMessageUpdate;
      usage: AIUsage;
    }) => void;
  },
) {
  const processEvent = (rawEvent: string) => {
    const trimmedEvent = rawEvent.trim();

    if (!trimmedEvent) {
      return;
    }

    const event = JSON.parse(trimmedEvent) as WorkflowStreamEvent;

    console.log('FULL WORKFLOW EVENT:', JSON.stringify(event, null, 2));

    if (
      event.type === 'workflow-step-suspended' &&
      event.payload?.stepName === 'understand-prompt' &&
      event.payload.status === 'suspended'
    ) {
      const suspendPayload = event.payload.suspendPayload;

      handlers.onSuspended({
        message:
          suspendPayload?.message ?? 'Please provide the missing information.',
        resumeData: {
          url: suspendPayload?.url ?? null,
          format: suspendPayload?.format ?? null,
          usage: suspendPayload?.usage ?? EMPTY_AI_USAGE,
        },
      });

      return;
    }

    if (
      event.type === 'workflow-step-result' &&
      event.payload?.stepName === 'understand-prompt' &&
      event.payload.status === 'success'
    ) {
      const output = event.payload.output as WorkflowRequestContext | undefined;

      handlers.onContextResolved({
        url: output?.url ?? null,
        format: output?.format ?? null,
      });
    }

    if (
      event.type === 'workflow-step-result' &&
      event.payload?.stepName === 'fetch-page' &&
      event.payload.status === 'success'
    ) {
      const output = event.payload.output as { url?: string };

      if (output?.url) {
        handlers.onPreviewUrl(output.url);
      }
    }

    if (
      event.type === 'workflow-step-result' &&
      event.payload?.stepName === 'summarize-page' &&
      event.payload.status === 'success'
    ) {
      const output = event.payload.output as
        | WorkflowTextResult
        | WorkflowJsonResult;

      handlers.onCompleted({
        update: formatWorkflowMessage(output),
        usage: output.usage ?? EMPTY_AI_USAGE,
      });
    }

    if (
      event.type === 'workflow-step-result' &&
      event.payload?.status === 'failed'
    ) {
      throw new Error(event.payload.error?.message ?? 'Workflow step failed');
    }
  };

  await consumeDelimitedStream({
    reader,
    delimiter: '\u001e',
    processChunk: processEvent,
  });
}

import { useState } from 'react';
import {
    createWorkflowRun,
    fetchPreviewHtml,
    streamAgentResponse,
    streamWorkflowResponse,
} from './api';
import {
    consumeAgentStream,
    consumeWorkflowStream,
} from './stream';
import type {
    AIUsage,
    Approach,
    AssistantMessageUpdate,
    ChatMessage,
    WorkflowRequestContext,
    WorkflowResumeData,
} from './types';
import {
    addAIUsage,
    EMPTY_AI_USAGE,
    subtractAIUsage,
} from './types';

const resourceId = 'website-preview-user';
const threadId = 'website-preview-thread';

function getErrorMessage(
    error: unknown,
    fallbackMessage: string
) {
    return error instanceof Error
        ? error.message
        : fallbackMessage;
}

export function useWebsitePreviewChat() {
    const [url, setUrl] = useState('');
    const [html, setHtml] = useState('');
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [approach, setApproachState] = useState<Approach>('agent');
    const [workflowRunId, setWorkflowRunId] = useState<string | null>(null);
    const [workflowResumeData, setWorkflowResumeData] =
        useState<WorkflowResumeData | null>(null);
    const [workflowRequestContext, setWorkflowRequestContext] =
        useState<WorkflowRequestContext>({
            url: null,
            format: null,
        });
    const [totalUsage, setTotalUsage] =
        useState<AIUsage>(EMPTY_AI_USAGE);

    function updateLastAssistantMessage({
        content,
        format,
    }: AssistantMessageUpdate) {
        setMessages((prev) =>
            prev.map((chatMessage, index) => {
                if (
                    chatMessage.role === 'assistant' &&
                    index === prev.length - 1
                ) {
                    return {
                        ...chatMessage,
                        content,
                        format,
                    };
                }

                return chatMessage;
            })
        );
    }

    function startConversationTurn(userMessage: string) {
        setMessages((prev) => [
            ...prev,
            {
                role: 'user',
                content: userMessage,
                format: 'text',
            },
            {
                role: 'assistant',
                content: '',
                format: 'text',
            },
        ]);
    }

    function resetWorkflowSession() {
        setWorkflowRunId(null);
        setWorkflowResumeData(null);
    }

    function addToTotalUsage(usage: AIUsage) {
        setTotalUsage((currentUsage) =>
            addAIUsage(currentUsage, usage)
        );
    }

    function updateWorkflowRequestContext(
        context: WorkflowRequestContext
    ) {
        setWorkflowRequestContext((currentContext) => ({
            url: context.url ?? currentContext.url,
            format:
                context.format ?? currentContext.format,
        }));
    }

    async function showPreview(previewUrl: string) {
        const preview = await fetchPreviewHtml(previewUrl);

        setUrl(preview.url);
        setHtml(preview.html);
    }

    function showPreviewInBackground(previewUrl: string) {
        void showPreview(previewUrl).catch((error) => {
            console.error('Preview update failed:', error);
        });
    }

    async function executeTurn({
        userMessage,
        run,
        onError,
    }: {
        userMessage: string;
        run: () => Promise<void>;
        onError: (error: unknown) => void;
    }) {
        setIsSending(true);
        startConversationTurn(userMessage);
        setMessage('');

        try {
            await run();
        } catch (error) {
            onError(error);
        } finally {
            setIsSending(false);
        }
    }

    async function handleAgentMessage(userMessage: string) {
        const reader = await streamAgentResponse(userMessage, {
            resource: resourceId,
            thread: threadId,
        });

        const finalMessage = await consumeAgentStream(reader, {
            onTextUpdate: updateLastAssistantMessage,
            onPreviewUrl: showPreviewInBackground,
            onUsage: addToTotalUsage,
        });

        updateLastAssistantMessage(finalMessage);
    }

    async function handleWorkflowMessage(userMessage: string) {
        const runId = workflowRunId ?? (await createWorkflowRun());

        if (!workflowRunId) {
            setWorkflowRunId(runId);
        }

        const reader = await streamWorkflowResponse({
            runId,
            message: userMessage,
            requestContext: workflowRequestContext,
            resumeData: workflowResumeData,
        });

        await consumeWorkflowStream(reader, {
            onContextResolved: (context) => {
                updateWorkflowRequestContext(context);
            },
            onSuspended: ({ message: suspendedMessage, resumeData }) => {
                const usageDelta = subtractAIUsage(
                    resumeData.usage,
                    workflowResumeData?.usage ?? EMPTY_AI_USAGE
                );

                addToTotalUsage(usageDelta);
                updateWorkflowRequestContext({
                    url: resumeData.url,
                    format: resumeData.format,
                });

                updateLastAssistantMessage({
                    content: suspendedMessage,
                    format: 'text',
                });
                setWorkflowResumeData(resumeData);
            },
            onPreviewUrl: showPreviewInBackground,
            onCompleted: ({ update, usage }) => {
                const usageDelta = subtractAIUsage(
                    usage,
                    workflowResumeData?.usage ?? EMPTY_AI_USAGE
                );

                addToTotalUsage(usageDelta);
                updateLastAssistantMessage(update);
                resetWorkflowSession();
            },
        });
    }

    function setApproach(nextApproach: Approach) {
        setApproachState(nextApproach);

        if (nextApproach !== 'workflow') {
            resetWorkflowSession();
        }
    }

    async function sendMessage() {
        const userMessage = message.trim();

        if (!userMessage || isSending) {
            return;
        }

        if (approach === 'agent') {
            await executeTurn({
                userMessage,
                run: () => handleAgentMessage(userMessage),
                onError: () => {
                    updateLastAssistantMessage({
                        content: 'Something went wrong. Please try again.',
                        format: 'text',
                    });
                },
            });

            return;
        }

        await executeTurn({
            userMessage,
            run: () => handleWorkflowMessage(userMessage),
            onError: (error) => {
                resetWorkflowSession();
                updateLastAssistantMessage({
                    content: getErrorMessage(
                        error,
                        'Something went wrong while running the workflow.'
                    ),
                    format: 'text',
                });
            },
        });
    }

    return {
        approach,
        html,
        isSending,
        message,
        messages,
        sendMessage,
        setApproach,
        setMessage,
        setUrl,
        showPreview,
        totalUsage,
        url,
    };
}

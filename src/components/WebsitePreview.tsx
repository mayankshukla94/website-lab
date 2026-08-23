import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/ui/icon';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    format?: 'text' | 'json';
};

type Approach = 'agent' | 'workflow';

export function WebsitePreview() {
    const [url, setUrl] = useState('');
    const [html, setHtml] = useState('');
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [approach, setApproach] = useState<Approach>('agent');
    const [workflowRunId, setWorkflowRunId] = useState<string | null>(null);
    const [workflowResumeData, setWorkflowResumeData] = useState<{
        url: string | null;
        format: 'text' | 'json' | null;
    } | null>(null);

    const resourceId = 'website-preview-user';
    const threadId = 'website-preview-thread';

    async function handleShowPreview(previewUrl: string) {
        const response = await fetch('http://localhost:4111/website-preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: previewUrl,
            }),
        });

        const data = await response.json();

        setUrl(previewUrl);
        setHtml(data.html);
    }

    function updateLastAssistantMessage(
        content: string,
        format: ChatMessage['format'] = 'text'
    ) {
        setMessages((prev) =>
            prev.map((msg, index) => {
                if (
                    msg.role === 'assistant' &&
                    index === prev.length - 1
                ) {
                    return {
                        ...msg,
                        content,
                        format,
                    };
                }

                return msg;
            })
        );
    }

    async function handleAgentMessage() {
        const userMessage = message.trim();

        if (!userMessage || isSending) return;

        setIsSending(true);

        setMessages((prev) => [
            ...prev,
            {
                role: 'user',
                content: userMessage,
            },
            {
                role: 'assistant',
                content: '',
                format: 'text',
            },
        ]);

        setMessage('');

        try {
            const response = await fetch(
                'http://localhost:4111/api/agents/website-preview-agent/stream',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messages: [
                            {
                                role: 'user' as const,
                                content: userMessage,
                            },
                        ],
                        memory: {
                            resource: resourceId,
                            thread: threadId,
                        },
                    }),
                }
            );

            if (!response.ok) {
                throw new Error('Agent request failed');
            }

            const reader = response.body?.getReader();

            if (!reader) return;

            const decoder = new TextDecoder();

            let buffer = '';
            let assistantText = '';

            const processStreamLine = (line: string) => {
                if (!line.startsWith('data: ')) return;

                const rawData = line.slice(6).trim();

                if (!rawData || rawData === '[DONE]') return;

                const event = JSON.parse(rawData);

                if (event.type === 'text-delta') {
                    assistantText += event.payload.text;

                    updateLastAssistantMessage(assistantText);
                }

                if (
                    event.type === 'tool-result' &&
                    event.payload?.toolName === 'websiteFetchTool'
                ) {
                    const previewUrl = event.payload?.result?.url;

                    if (previewUrl) {
                        handleShowPreview(previewUrl);
                    }
                }
            };

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, {
                    stream: true,
                });

                const lines = buffer.split('\n');

                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    processStreamLine(line);
                }
            }

            buffer += decoder.decode();

            for (const line of buffer.split('\n')) {
                processStreamLine(line);
            }

            try {
                const parsed = JSON.parse(assistantText);

                updateLastAssistantMessage(
                    JSON.stringify(parsed, null, 2),
                    'json'
                );
            } catch {
                updateLastAssistantMessage(
                    assistantText,
                    'text'
                );
            }
        } catch (error) {
            console.error(error);

            updateLastAssistantMessage(
                'Something went wrong. Please try again.'
            );
        } finally {
            setIsSending(false);
        }
    }

    async function handleWorkflowMessage() {
        const userMessage = message.trim();

        if (!userMessage || isSending) return;

        setIsSending(true);

        setMessages((prev) => [
            ...prev,
            {
                role: 'user',
                content: userMessage,
            },
            {
                role: 'assistant',
                content: '',
                format: 'text',
            },
        ]);

        setMessage('');

        try {
            let runId: string;

            if (workflowRunId) {
                runId = workflowRunId
            } else {
                const createRunResponse = await fetch(
                    'http://localhost:4111/api/workflows/website-analysis-workflow/create-run',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    }
                );

                if (!createRunResponse.ok) {
                    throw new Error('Failed to create workflow run');
                }

                const runData = await createRunResponse.json();

                runId = runData.runId;
                setWorkflowRunId(runId);
            }

            const isResume = workflowResumeData !== null;

            const endpoint = isResume
                ? `http://localhost:4111/api/workflows/website-analysis-workflow/resume-stream?runId=${encodeURIComponent(runId)}`
                : `http://localhost:4111/api/workflows/website-analysis-workflow/stream?runId=${encodeURIComponent(runId)}`;

            const body = isResume
                ? {
                    step: 'understand-prompt',
                    resumeData: {
                        ...workflowResumeData,
                        prompt: userMessage,
                    },
                }
                : {
                    inputData: {
                        prompt: userMessage,
                    },
                };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error('Workflow request failed');
            }

            const reader = response.body?.getReader();

            if (!reader) {
                throw new Error('Workflow response has no readable stream');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            const processWorkflowEvent = (rawEvent: string) => {
                const trimmedEvent = rawEvent.trim();

                if (!trimmedEvent) return;

                const event = JSON.parse(trimmedEvent);
                console.log(
                    'FULL WORKFLOW EVENT:',
                    JSON.stringify(event, null, 2)
                );

                //Workflow suspended and waiting for user input
                if (
                    event.type === 'workflow-step-suspended' &&
                    event.payload?.stepName === 'understand-prompt' &&
                    event.payload?.status === 'suspended'
                ) {
                    const suspendPayload = event.payload?.suspendPayload;

                    updateLastAssistantMessage(
                        suspendPayload?.message ??
                        'Please provide the missing information.',
                        'text'
                    );

                    setWorkflowResumeData({
                        url: suspendPayload?.url ?? null,
                        format: suspendPayload?.format ?? null,
                    });

                    return;
                }

                // Fetch finished -> update preview
                if (
                    event.type === 'workflow-step-result' &&
                    event.payload?.stepName === 'fetch-page' &&
                    event.payload?.status === 'success'
                ) {
                    const previewUrl = event.payload.output?.url;

                    if (previewUrl) {
                        handleShowPreview(previewUrl);
                    }
                }

                // Final analysis
                if (
                    event.type === 'workflow-step-result' &&
                    event.payload?.stepName === 'summarize-page' &&
                    event.payload?.status === 'success'
                ) {
                    const result = event.payload.output;

                    if (
                        result &&
                        typeof result === 'object' &&
                        'pageSummary' in result
                    ) {
                        updateLastAssistantMessage(
                            JSON.stringify(result, null, 2),
                            'json'
                        );
                    } else if (result?.format === 'text') {
                        updateLastAssistantMessage(
                            result.text ?? '',
                            'text'
                        );
                    } else {
                        updateLastAssistantMessage(
                            JSON.stringify(result?.data ?? result, null, 2),
                            'json'
                        );
                    }

                    // Workflow complete, reset resume state
                    setWorkflowRunId(null);
                    setWorkflowResumeData(null);
                }

                if (
                    event.type === 'workflow-step-result' &&
                    event.payload?.status === 'failed'
                ) {
                    throw new Error(
                        event.payload?.error?.message ??
                        'Workflow step failed'
                    );
                }
            };

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, {
                    stream: true,
                });

                const events = buffer.split('\u001e');
                buffer = events.pop() ?? '';

                for (const rawEvent of events) {
                    processWorkflowEvent(rawEvent);
                }
            }

            buffer += decoder.decode();

            if (buffer.trim()) {
                processWorkflowEvent(buffer);
            }
        } catch (error) {
            console.error('Workflow error:', error);

            updateLastAssistantMessage(
                error instanceof Error
                    ? error.message
                    : 'Something went wrong while running the workflow.',
                'text'
            );
        } finally {
            setIsSending(false);
        }
    }

    function handleSendMessage() {
        if (approach === 'agent') {
            handleAgentMessage();
            return;
        }

        handleWorkflowMessage();
    }

    return (
        <div className="flex h-screen">
            {/* Left Panel */}
            <div className="flex flex-1 flex-col border-r border-slate-300">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-slate-300 bg-white p-4">
                    <Input
                        type="url"
                        value={url}
                        placeholder="Enter website URL..."
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1 border-blue-500 focus-visible:ring-blue-500"
                    />

                    <Button
                        onClick={() => handleShowPreview(url)}
                        className="cursor-pointer bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500"
                    >
                        Preview Page
                    </Button>
                </div>

                {/* Preview */}
                <div className="flex-1 bg-white">
                    <div className="flex h-full items-center justify-center text-slate-500">
                        {html ? (
                            <iframe
                                className="h-full w-full border-0"
                                srcDoc={html}
                                title="Page Preview"
                                onLoad={(e) => {
                                    const iframe = e.currentTarget;
                                    const iframeDocument =
                                        iframe.contentDocument;

                                    iframeDocument?.addEventListener(
                                        'click',
                                        (event) => {
                                            const target =
                                                event.target as HTMLElement;

                                            if (target.closest('a')) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                            }
                                        }
                                    );
                                }}
                            />
                        ) : (
                            <div className="text-slate-500">
                                Website Page Preview
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Panel */}
            <div className="flex w-[450px] flex-col bg-white">
                <div className="border-b border-slate-300 p-4">
                    <h2 className="font-semibold">
                        AI Assistant
                    </h2>
                </div>

                {/* Approach Selector */}
                <div className="flex gap-2 border-b border-slate-300 p-4">
                    <Button
                        type="button"
                        variant={
                            approach === 'agent'
                                ? 'default'
                                : 'outline'
                        }
                        onClick={() => setApproach('agent')}
                        disabled={isSending}
                        className="cursor-pointer"
                    >
                        Agent + Tool
                    </Button>

                    <Button
                        type="button"
                        variant={
                            approach === 'workflow'
                                ? 'default'
                                : 'outline'
                        }
                        onClick={() => setApproach('workflow')}
                        disabled={isSending}
                        className="cursor-pointer"
                    >
                        Workflow
                    </Button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-auto p-4">
                    {messages.map((message, index) => {
                        if (!message.content) return null;

                        return (
                            <div
                                key={index}
                                className={
                                    message.role === 'user'
                                        ? 'mb-4 rounded-lg bg-slate-100 p-4 text-slate-900'
                                        : 'mb-4 rounded-lg bg-slate-200 p-4 text-slate-900'
                                }
                            >
                                {message.format === 'json' ? (
                                    <pre className="whitespace-pre-wrap break-words text-sm">
                                        {message.content}
                                    </pre>
                                ) : (
                                    <div className="whitespace-pre-wrap">
                                        {message.content}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Composer */}
                <div className="border-t border-slate-300 p-4">
                    <div className="relative">
                        <Textarea
                            value={message}
                            onChange={(e) =>
                                setMessage(e.target.value)
                            }
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    !e.shiftKey
                                ) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder={
                                approach === 'agent'
                                    ? 'Ask the agent to preview and analyze a website...'
                                    : 'Ask the workflow to analyze a website...'
                            }
                            className="min-h-10 resize-none border-blue-500 pr-11 focus-visible:ring-blue-500"
                        />

                        <Button
                            type="button"
                            size="icon"
                            disabled={
                                !message.trim() || isSending
                            }
                            onClick={handleSendMessage}
                            className="absolute right-1 top-1 cursor-pointer rounded-full bg-blue-600 hover:bg-blue-700"
                        >
                            <Icon icon={faArrowUp} />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

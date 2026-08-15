import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from "@/components/ui/icon";
import { faArrowUp } from '@fortawesome/free-solid-svg-icons'

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    format?: 'text' | 'json';
};

export function WebsitePreview() {
    const [url, setUrl] = useState('');
    const [html, setHtml] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const resourceId = "website-preview-user";
    const threadId = "website-preview-thread";

    async function handleShowPreview(previewUrl: string) {
        const response = await fetch('http://localhost:4111/website-preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: previewUrl }),
        });

        const data = await response.json();

        setHtml(data.html);
    }

    async function handleSendMessage() {
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
            const response = await fetch(`http://localhost:4111/api/agents/website-preview-agent/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [{
                        role: 'user',
                        content: userMessage,
                    }],
                    memory: {
                        resource: resourceId,
                        thread: threadId,
                    },
                }),
            });

            const reader = response.body?.getReader();

            if (!reader) return;

            const decoder = new TextDecoder();

            let buffer = '';
            let assistantText = '';

            const updateAssistantMessage = (content: string, format: ChatMessage['format'] = 'text') => {
                setMessages((prev) =>
                    prev.map((message, index) => {
                        if (message.role === 'assistant' && index === prev.length - 1) {
                            return {
                                ...message,
                                content,
                                format,
                            };
                        }

                        return message;
                    })
                );
            };

            const processStreamLine = (line: string) => {
                if (!line.startsWith('data: ')) return;

                const rawData = line.slice(6).trim();

                if (!rawData || rawData === '[DONE]') return;

                const event = JSON.parse(rawData);
                console.log(event);

                if (event.type === 'text-delta') {
                    assistantText += event.payload.text;
                    updateAssistantMessage(assistantText);
                }

                if (event.type === 'tool-result' && event.payload?.toolName === 'websiteFetchTool') {
                    const previewUrl = event.payload.result?.url;

                    if (previewUrl) {
                        setUrl(previewUrl);
                        handleShowPreview(previewUrl);
                    }
                }
            };

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
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
                updateAssistantMessage(JSON.stringify(parsed, null, 2), 'json');
            } catch {
                updateAssistantMessage(assistantText, 'text');
            }
        } finally {
            setIsSending(false);
        }
    }

    return (
        <div className="flex h-screen">
            {/* Left Panel */}
            <div className="flex flex-1 flex-col border-r border-slate-300">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-slate-300 bg-white p-4">
                    <Input
                        type="url"
                        placeholder="Enter website URL..."
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1 border-blue-500 focus-visible:ring-blue-500"
                    />

                    <Button onClick={() => handleShowPreview(url)} className="bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500">
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
                                    const iframe = e.currentTarget
                                    const iframeDocument = iframe.contentDocument

                                    iframeDocument?.addEventListener('click', (event) => {
                                        const target = event.target as HTMLElement

                                        if (target.closest('a')) {
                                            event.preventDefault()
                                            event.stopPropagation()
                                        }
                                    })
                                }}
                            />
                        ) : (
                            <div className="text-slate-500">Website Page Preview</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Panel */}
            <div className="flex w-[450px] flex-col bg-white">
                <div className="border-b border-slate-300 p-4">
                    <h2 className="font-semibold">AI Assistant</h2>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    {messages.map((message, index) => {
                        if (!message.content) return null;

                        return (<div
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
                        )
                    })
                    }
                </div>

                <div className="border-t border-slate-300 p-4">
                    <div className="relative">
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder="Enter your website URL..."
                            className="min-h-10 border-blue-500 focus-visible:ring-blue-500 pr-11"
                        />
                        <Button size="icon"
                            onClick={handleSendMessage} disabled={isSending || !message.trim()} className="absolute right-1 top-1 rounded-full bg-blue-600 hover:bg-blue-700">
                            <Icon icon={faArrowUp} />
                        </Button></div>
                </div>
            </div>
        </div>
    );
}

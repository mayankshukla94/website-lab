import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from "@/components/ui/icon";
import { faArrowUp } from '@fortawesome/free-solid-svg-icons'

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export function WebsitePreview() {
    const [url, setUrl] = useState('');
    const [html, setHtml] = useState('');
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const resourceId = "website-preview-user";
    const threadId = "website-preview-thread";

    async function handleShowPreview() {
        const response = await fetch('http://localhost:4111/website-preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();

        setHtml(data.html);
    }

    async function handleSendMessage() {
        const userMessage = message.trim();

        if (!userMessage) return;

        const conversation = [
            ...messages,
            {
                role: 'user' as const,
                content: userMessage,
            },
        ];

        setMessages([
            ...conversation,
            {
                role: 'assistant',
                content: '',
            },
        ]);

        setMessage('');

        const response = await fetch(`http://localhost:4111/api/agents/website-preview-agent/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: conversation,
                resourceId,
                threadId,
            }),
        });

        const reader = response.body?.getReader();

        if (!reader) return;

        const decoder = new TextDecoder();

        let buffer = '';
        let assistantText = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const rawData = line.slice(6);

                if (rawData === '[DONE]') continue;

                const event = JSON.parse(rawData);

                if (event.type === 'text-delta') {
                    assistantText += event.payload.text;

                    setMessages((prev) => (
                        prev.map((message, index) => {
                            if (message.role === 'assistant' && index === prev.length - 1) {
                                return {
                                    ...message,
                                    content: assistantText,
                                };
                            }
                            return message;
                        })
                    ))
                }
            }
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

                    <Button onClick={handleShowPreview} className="bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500">
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
                        >{message.content}</div>
                        )
                    })
                    }
                </div>

                <div className="relative border-t border-slate-300 p-4">
                    <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Enter your website URL..."
                        className="min-h-10 border-blue-500 focus-visible:ring-blue-500 pr-11"
                    />
                    <Button size="icon"
                        onClick={handleSendMessage} className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full bg-blue-600 hover:bg-blue-700">
                        <Icon icon={faArrowUp} />
                    </Button>
                </div>
            </div>
        </div>
    );
}

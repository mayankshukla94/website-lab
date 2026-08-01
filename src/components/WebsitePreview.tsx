import { useState } from 'react';

export function WebsitePreview() {
    const [url, setUrl] = useState('');
    const [html, setHtml] = useState('');

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

    return (
        <div className="flex h-screen">
            {/* Left Panel */}
            <div className="flex flex-1 flex-col border-r border-slate-300">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-slate-300 bg-white p-4">
                    <input
                        type="url"
                        placeholder="Enter website URL..."
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-blue-500"
                    />

                    <button onClick={handleShowPreview} className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
                        Preview Page
                    </button>
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
            <div className="flex w-[400px] flex-col bg-white">
                <div className="border-b border-slate-300 p-4">
                    <h2 className="font-semibold">AI Assistant</h2>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    Messages...
                </div>

                <div className="border-t border-slate-300 p-4">
                    <input
                        placeholder="Ask anything..."
                        className="w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-blue-500"
                    />
                </div>
            </div>
        </div>
    );
}

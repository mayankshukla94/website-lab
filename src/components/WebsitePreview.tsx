import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useWebsitePreviewChat } from '@/features/website-preview/useWebsitePreviewChat';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';

function formatTokenCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function createPreviewDocument(html: string) {
  const interactionBlocker = `
<script>
    (() => {
        const blockInteraction = (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };

        document.addEventListener('click', blockInteraction, true);
        document.addEventListener('auxclick', blockInteraction, true);
        document.addEventListener('submit', blockInteraction, true);
    })();
</script>`;

  if (html.match(/<\/body>/i)) {
    return html.replace(/<\/body>/i, `${interactionBlocker}</body>`);
  }

  return `${html}${interactionBlocker}`;
}

export function WebsitePreview() {
  const {
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
  } = useWebsitePreviewChat();

  return (
    <div className="flex h-screen">
      <div className="flex flex-1 flex-col border-r border-slate-300">
        <div className="flex items-center gap-3 border-b border-slate-300 bg-white p-4">
          <Input
            type="url"
            value={url}
            placeholder="Enter website URL..."
            onChange={(event) => setUrl(event.target.value)}
            className="flex-1 border-blue-500 focus-visible:ring-blue-500"
          />

          <Button
            onClick={() => {
              void showPreview(url).catch((error) => {
                console.error('Preview request failed:', error);
              });
            }}
            className="cursor-pointer bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500"
          >
            Preview Page
          </Button>
        </div>

        <div className="flex-1 bg-white">
          <div className="flex h-full items-center justify-center text-slate-500">
            {html ? (
              <iframe
                className="h-full w-full border-0"
                sandbox="allow-forms allow-scripts"
                srcDoc={createPreviewDocument(html)}
                title="Page Preview"
              />
            ) : (
              <div className="text-slate-500">Website Page Preview</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-[450px] flex-col bg-white">
        <div className="border-b border-slate-300 p-4">
          <h2 className="font-semibold">AI Assistant</h2>
          <p className="mt-1 text-sm text-slate-500">
            Total AI Usage: {formatTokenCount(totalUsage.totalTokens)} tokens
          </p>
          <p className="text-xs text-slate-400">
            {formatTokenCount(totalUsage.inputTokens)} in
            {' • '}
            {formatTokenCount(totalUsage.outputTokens)} out
          </p>
        </div>

        <div className="flex gap-2 border-b border-slate-300 p-4">
          <Button
            type="button"
            variant={approach === 'agent' ? 'default' : 'outline'}
            onClick={() => setApproach('agent')}
            disabled={isSending}
            className="cursor-pointer"
          >
            Agent + Tool
          </Button>

          <Button
            type="button"
            variant={approach === 'workflow' ? 'default' : 'outline'}
            onClick={() => setApproach('workflow')}
            disabled={isSending}
            className="cursor-pointer"
          >
            Workflow
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {messages.map((chatMessage, index) => {
            if (!chatMessage.content) return null;

            return (
              <div
                key={index}
                className={
                  chatMessage.role === 'user'
                    ? 'mb-4 rounded-lg bg-slate-100 p-4 text-slate-900'
                    : 'mb-4 rounded-lg bg-slate-200 p-4 text-slate-900'
                }
              >
                {chatMessage.format === 'json' ? (
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {chatMessage.content}
                  </pre>
                ) : (
                  <div className="whitespace-pre-wrap">
                    {chatMessage.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-300 p-4">
          <div className="relative">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
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
              disabled={!message.trim() || isSending}
              onClick={() => {
                void sendMessage();
              }}
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

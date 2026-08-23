import type {
    WorkflowRequestContext,
    WorkflowResumeData,
} from './types';

const API_BASE_URL = 'http://localhost:4111';

type PreviewResponse = {
    html: string;
};

type WorkflowRunResponse = {
    runId: string;
};

async function createStreamReader(
    input: RequestInfo | URL,
    init: RequestInit,
    errorMessage: string
) {
    const response = await fetch(input, init);

    if (!response.ok) {
        throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();

    if (!reader) {
        throw new Error(`${errorMessage}: response stream unavailable`);
    }

    return reader;
}

export async function fetchPreviewHtml(previewUrl: string) {
    const response = await fetch(`${API_BASE_URL}/website-preview`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: previewUrl,
        }),
    });

    if (!response.ok) {
        throw new Error('Preview request failed');
    }

    const data = (await response.json()) as PreviewResponse;

    return {
        url: previewUrl,
        html: data.html,
    };
}

export function streamAgentResponse(
    message: string,
    memory: {
        resource: string;
        thread: string;
    }
) {
    return createStreamReader(
        `${API_BASE_URL}/api/agents/website-preview-agent/stream`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        content: message,
                    },
                ],
                memory,
            }),
        },
        'Agent request failed'
    );
}

export async function createWorkflowRun() {
    const response = await fetch(
        `${API_BASE_URL}/api/workflows/website-analysis-workflow/create-run`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to create workflow run');
    }

    const data = (await response.json()) as WorkflowRunResponse;

    return data.runId;
}

export function streamWorkflowResponse({
    runId,
    message,
    requestContext,
    resumeData,
}: {
    runId: string;
    message: string;
    requestContext: WorkflowRequestContext;
    resumeData: WorkflowResumeData | null;
}) {
    const isResume = resumeData !== null;

    const endpoint = isResume
        ? `${API_BASE_URL}/api/workflows/website-analysis-workflow/resume-stream?runId=${encodeURIComponent(runId)}`
        : `${API_BASE_URL}/api/workflows/website-analysis-workflow/stream?runId=${encodeURIComponent(runId)}`;

    const body = isResume
        ? {
            step: 'understand-prompt',
            resumeData: {
                ...resumeData,
                prompt: message,
            },
        }
        : {
            inputData: {
                prompt: message,
                context: requestContext,
            },
        };

    return createStreamReader(
        endpoint,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        },
        'Workflow request failed'
    );
}

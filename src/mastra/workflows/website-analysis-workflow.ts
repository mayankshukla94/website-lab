import { createStep, createWorkflow } from '@mastra/core/workflows';
import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import {
    fetchWebsitePage,
    websiteFetchOutputSchema,
} from '../lib/website-fetch';
import {
    buildSummarizePageSystemPrompt,
    EXTRACT_REQUEST_DETAILS_SYSTEM_PROMPT,
    FORMAT_SELECTION_QUESTION,
    MISSING_URL_MESSAGE,
} from '../lib/website-analysis-prompts';

const requestedFormatSchema = z.enum(['text', 'json']);

const aiUsageSchema = z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
});

const extractedRequestSchema = z.object({
    url: z.url().nullable(),
    format: requestedFormatSchema.nullable(),
});

const understandRequestInputSchema = z.object({
    prompt: z.string(),
    context: z
        .object({
            url: z.url().nullable().optional(),
            format:
                requestedFormatSchema.nullable().optional(),
        })
        .optional(),
});

const understandRequestResumeSchema = z.object({
    prompt: z.string().optional(),
    url: z.url().nullable().optional(),
    format: requestedFormatSchema.nullable().optional(),
    usage: aiUsageSchema.optional(),
});

const understandRequestSuspendSchema = z.object({
    message: z.string(),
    url: z.url().nullable().optional(),
    format: requestedFormatSchema.nullable().optional(),
    usage: aiUsageSchema,
});

const understandRequestOutputSchema = z.object({
    url: z.url(),
    format: requestedFormatSchema,
    usage: aiUsageSchema,
});

const pageAnalysisSchema = z.object({
    pageSummary: z.string(),
    sections: z.array(
        z.object({
            type: z.string(),
            heading: z.string(),
            description: z.string(),
        })
    ),
});

const fetchPageOutputSchema = websiteFetchOutputSchema.extend({
    format: requestedFormatSchema,
    usage: aiUsageSchema,
});

const workflowOutputSchema = z.union([
    z.object({
        format: z.literal('text'),
        text: z.string(),
        usage: aiUsageSchema,
    }),
    z.object({
        format: z.literal('json'),
        data: pageAnalysisSchema,
        usage: aiUsageSchema,
    }),
]);

const emptyUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
};

function normalizeUsage(usage: {
    inputTokens?: number;
    outputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}) {
    const inputTokens =
        usage.inputTokens ?? usage.promptTokens ?? 0;
    const outputTokens =
        usage.outputTokens ?? usage.completionTokens ?? 0;

    return {
        inputTokens,
        outputTokens,
        totalTokens:
            usage.totalTokens ??
            inputTokens + outputTokens,
    };
}

function addUsage(
    current: typeof emptyUsage,
    next: typeof emptyUsage
) {
    return {
        inputTokens: current.inputTokens + next.inputTokens,
        outputTokens: current.outputTokens + next.outputTokens,
        totalTokens: current.totalTokens + next.totalTokens,
    };
}

async function extractRequestDetails(prompt: string) {
    const result = await generateText({
        model: google('gemini-3.5-flash-lite'),
        system: EXTRACT_REQUEST_DETAILS_SYSTEM_PROMPT,
        prompt,
        output: Output.object({
            schema: extractedRequestSchema,
        }),
    });

    console.log('EXTRACT REQUEST USAGE:', result.usage);

    return {
        output: result.output,
        usage: normalizeUsage(result.usage),
    };
}

const understandRequestStep = createStep({
    id: 'understand-prompt',
    inputSchema: understandRequestInputSchema,
    resumeSchema: understandRequestResumeSchema,
    suspendSchema: understandRequestSuspendSchema,
    outputSchema: understandRequestOutputSchema,
    execute: async ({ inputData, suspend, resumeData }) => {
        let url: string | null = resumeData?.url ?? null;
        let format: 'text' | 'json' | null = resumeData?.format ?? null;
        let usage = resumeData?.usage ?? emptyUsage;
        const prompt = resumeData?.prompt ?? inputData.prompt;
        const context = inputData.context;

        if (prompt && (!url || !format)) {
            const extractedRequest = await extractRequestDetails(prompt);

            usage = addUsage(usage, extractedRequest.usage);
            url ??=
                extractedRequest.output.url ??
                context?.url ??
                null;
            format ??=
                extractedRequest.output.format ??
                context?.format ??
                null;
        } else {
            url ??= context?.url ?? null;
            format ??= context?.format ?? null;
        }

        if (!url) {
            return await suspend({
                message: MISSING_URL_MESSAGE,
                format,
                usage,
            });
        }

        if (!format) {
            return await suspend({
                message: FORMAT_SELECTION_QUESTION,
                url,
                usage,
            });
        }

        return {
            url,
            format,
            usage,
        };
    },
});

const fetchPageStep = createStep({
    id: 'fetch-page',
    inputSchema: understandRequestOutputSchema,
    outputSchema: fetchPageOutputSchema,
    execute: async ({ inputData }) => {
        const page = await fetchWebsitePage(inputData.url);

        return {
            ...page,
            format: inputData.format,
            usage: inputData.usage,
        };
    },
});

export const summarizePageStep = createStep({
    id: 'summarize-page',
    inputSchema: fetchPageOutputSchema,
    outputSchema: workflowOutputSchema,
    execute: async ({ inputData }) => {
        const prompt = `
            Analyze this website page.

            URL:
            ${inputData.url}

            Sections:
            ${JSON.stringify(inputData.sections, null, 2)}
        `;

        if (inputData.format === 'text') {
            const result = await generateText({
                model: google('gemini-3.5-flash-lite'),
                system: buildSummarizePageSystemPrompt('text'),
                prompt,
            });

            console.log('SUMMARIZE PAGE TEXT USAGE:', result.usage);

            const usage = addUsage(
                inputData.usage,
                normalizeUsage(result.usage)
            );

            return {
                format: 'text' as const,
                text: result.text,
                usage,
            };
        }

        const result = await generateText({
            model: google('gemini-3.5-flash-lite'),
            system: buildSummarizePageSystemPrompt('json'),
            prompt,
            output: Output.object({
                schema: pageAnalysisSchema,
            }),
        });

        console.log('SUMMARIZE PAGE JSON USAGE:', result.usage);

        const usage = addUsage(
            inputData.usage,
            normalizeUsage(result.usage)
        );

        return {
            format: 'json' as const,
            data: result.output,
            usage,
        };
    },
});

export const websiteAnalysisWorkflow = createWorkflow({
    id: 'website-analysis-workflow',
    inputSchema: understandRequestInputSchema,
    outputSchema: workflowOutputSchema,
})
    .then(understandRequestStep)
    .then(fetchPageStep)
    .then(summarizePageStep);

websiteAnalysisWorkflow.commit();

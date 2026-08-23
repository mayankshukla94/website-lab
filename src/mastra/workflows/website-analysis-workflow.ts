import { createStep, createWorkflow } from '@mastra/core/workflows';
import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import {
    fetchWebsitePage,
    websiteFetchOutputSchema,
} from '../lib/website-fetch';

const requestedFormatSchema = z.enum(['text', 'json']);

const extractedRequestSchema = z.object({
    url: z.url().nullable(),
    format: requestedFormatSchema.nullable(),
});

const understandRequestInputSchema = z.object({
    prompt: z.string(),
});

const understandRequestResumeSchema = z.object({
    prompt: z.string().optional(),
    url: z.url().nullable().optional(),
    format: requestedFormatSchema.nullable().optional(),
});

const understandRequestSuspendSchema = z.object({
    message: z.string(),
    url: z.url().nullable().optional(),
    format: requestedFormatSchema.nullable().optional(),
});

const understandRequestOutputSchema = z.object({
    url: z.url(),
    format: requestedFormatSchema,
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
});

const workflowOutputSchema = z.union([
    z.object({
        format: z.literal('text'),
        text: z.string(),
    }),
    z.object({
        format: z.literal('json'),
        data: pageAnalysisSchema,
    }),
]);

async function extractRequestDetails(prompt: string) {
    const result = await generateText({
        model: google('gemini-3.5-flash-lite'),
        system: `
            Understand the user's website analysis request.

            Extract:
            - the website URL
            - the requested output format, if specified

            Rules:
            - If the URL does not include a protocol, prepend https://.
            - If the user asks for text, return format as "text".
            - If the user asks for JSON or structured JSON, return format as "json".
            - If no URL is provided, return url as null.
            - If no output format is provided, return format as null.
        `,
        prompt,
        output: Output.object({
            schema: extractedRequestSchema,
        }),
    });

    return result.output;
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
        const prompt = resumeData?.prompt ?? inputData.prompt;

        if (prompt && (!url || !format)) {
            const extractedRequest = await extractRequestDetails(prompt);

            url ??= extractedRequest.url;
            format ??= extractedRequest.format;
        }

        if (!url) {
            return await suspend({
                message: 'Please provide a website URL to analyze.',
                format,
            });
        }

        if (!format) {
            return await suspend({
                message:
                    'Would you like the page analysis as text or structured JSON?',
                url,
            });
        }

        return {
            url,
            format,
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
                system: `
                    You analyze extracted website page sections.

                    Rules:
                    - Ignore empty and utility sections.
                    - Prefer explicit semantic class names over content-based inference.
                    - If className contains "hero-section", classify it as "hero".
                    - If className contains "shoutout", classify it as "shoutout".
                    - When className is generic, infer the section type from heading and text.
                    - Preserve the original section order.
                    - Include only meaningful sections.
                    - Return plain text only.
                    - Do not use Markdown.
                    - Do not use JSON.
                    - Return only a concise summary of what the page is about.
                    - Mention the business or page purpose, the main service or offer, and the main call to action.
                    - Keep it to 2 to 4 sentences.
                    - Do not list sections.
                    - Do not mention type, heading, or description fields.
                `,
                prompt,
            });

            return {
                format: 'text' as const,
                text: result.text,
            };
        }

        const result = await generateText({
            model: google('gemini-3.5-flash-lite'),
            system: `
                You analyze extracted website page sections.

                Rules:
                - Ignore empty and utility sections.
                - Prefer explicit semantic class names over content-based inference.
                - If className contains "hero-section", classify it as "hero".
                - If className contains "shoutout", classify it as "shoutout".
                - When className is generic, infer the section type from heading and text.
                - Preserve the original section order.
                - Include only meaningful sections.
                - Keep the page summary and descriptions concise.
                - Return valid JSON only.
                - Do not include Markdown.
                - Do not include code fences.
                - Use this exact shape:
                    {
                        "pageSummary": "string",
                        "sections": [
                            {
                                "type": "string",
                                "heading": "string",
                                "description": "string"
                            }
                        ]
                    }
            `,
            prompt,
            output: Output.object({
                schema: pageAnalysisSchema,
            }),
        });

        return {
            format: 'json' as const,
            data: result.output,
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

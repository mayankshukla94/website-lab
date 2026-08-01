import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

export const websiteFetchTool = createTool({
    id: 'website-fetch-tool',
    description: 'Fetches the raw HTML content of a given website URL',
    inputSchema: z.object({
        url: z.url().describe('The URL of the website to fetch'),
    }),
    outputSchema: z.object({
        url: z.url(),
        statusCode: z.number(),
        contentType: z.string(),
        sections: z.array(
            z.object({
                index: z.number(),
                className: z.string(),
                heading: z.string(),
                text: z.string(),
            })
        )
    }),

    execute: async (inputData) => {
        const response = await fetch(inputData.url, {
            headers: {
                "User-Agent": "Mozilla/5.0 Website Importer",
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch the website. Status: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const sections = $('section')
            .map((index, element) => {
                const heading =
                    $(element)
                        .find('h1, h2, h3')
                        .first()
                        .text()
                        .trim() || 'Untitled Section';

                const text = $(element)
                    .text()
                    .replace(/\s+/g, ' ')
                    .trim();

                const className = $(element).attr('class') ?? '';

                return {
                    index,
                    className,
                    heading,
                    text: text.slice(0, 300),
                };
            })
            .get();

        return {
            url: inputData.url,
            statusCode: response.status,
            contentType: response.headers.get('content-type') || 'unknown',
            sections,
        };
    }
})
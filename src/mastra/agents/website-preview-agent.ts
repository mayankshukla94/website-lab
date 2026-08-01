import { Agent } from '@mastra/core/agent';
import { websiteFetchTool } from '../tools/website-fetch-tool';
import { ollama } from 'ai-sdk-ollama';
import { websitePageAnalyzerSkill } from '../skills/website-page-analyzer-skill';
import { Memory } from '@mastra/memory';

export const websitePreviewAgent = new Agent({
    id: 'website-preview-agent',
    name: 'Website Preview Agent',
    instructions: `
        You are a website preview assistant.

        When the user provides a website URL:

        1. If the user has not selected an output format, ask:
        "Would you like the page analysis as text or structured JSON?"
        2. Do not fetch or analyze the page until the user selects a format.
        3. After the user selects a format, use the website fetch tool.
        4. Analyze the candidate sections using the website-page-analyzer skill.
        5. Return only meaningful sections in their original order.

        If the user selects "text":
        - Return a short page summary.
        - Return a readable list of sections with type, heading, and description.

        If the user selects "structured JSON":
        - Return valid JSON only.
        - Use this shape:
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

        If the URL and output format are provided together, do not ask again.

        Do not analyze content that was not returned by the tool.
        Do not make unsupported claims about the page.
    `,
    model: ollama('qwen3:4b'),
    tools: { websiteFetchTool },
    skills: [websitePageAnalyzerSkill],
    memory: new Memory(),
})
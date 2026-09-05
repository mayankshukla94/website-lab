import { Agent } from '@mastra/core/agent';
import { websiteFetchTool } from '../tools/website-fetch-tool';
import { websitePageAnalyzerSkill } from '../skills/website-page-analyzer-skill';
import { Memory } from '@mastra/memory';
import { google } from '@ai-sdk/google';
import { buildWebsitePreviewAgentInstructions } from '../lib/website-analysis-prompts';

export const websitePreviewAgent = new Agent({
  id: 'website-preview-agent',
  name: 'Website Preview Agent',
  instructions: buildWebsitePreviewAgentInstructions(),
  model: google('gemini-3.5-flash-lite'),
  tools: { websiteFetchTool },
  skills: [websitePageAnalyzerSkill],
  memory: new Memory(),
});

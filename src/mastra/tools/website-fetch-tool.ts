import { createTool } from '@mastra/core/tools';
import {
  fetchWebsitePage,
  websiteFetchOutputSchema,
  websiteFetchInputSchema,
} from '../lib/website-fetch';

export const websiteFetchTool = createTool({
  id: 'website-fetch-tool',

  description: 'Fetches a website page and extracts candidate page sections.',

  inputSchema: websiteFetchInputSchema,

  outputSchema: websiteFetchOutputSchema,

  execute: async (inputData) => {
    return fetchWebsitePage(inputData.url);
  },
});

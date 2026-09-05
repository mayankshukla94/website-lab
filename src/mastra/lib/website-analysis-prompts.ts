type OutputFormat = 'text' | 'json';

export const FORMAT_SELECTION_QUESTION =
  'Would you like the page analysis as text or structured JSON?';

export const MISSING_URL_MESSAGE = 'Please provide a website URL to analyze.';

export const JSON_OUTPUT_EXACT_SHAPE = `{
    "pageSummary": "string",
    "sections": [
        {
            "type": "string",
            "heading": "string",
            "description": "string"
        }
    ]
}`;

const SECTION_ANALYSIS_RULES = [
  'Ignore empty and utility sections.',
  'Prefer explicit semantic class names over content-based inference.',
  'If className contains "hero-section", classify it as "hero".',
  'If className contains "shoutout", classify it as "shoutout".',
  'When className is generic, infer the section type from heading and text.',
  'Preserve the original section order.',
  'Include only meaningful sections.',
];

const TEXT_OUTPUT_RULES = [
  'Return plain text only.',
  'Do not use Markdown.',
  'Do not use JSON.',
  'Return only a concise summary of what the page is about.',
  'Mention the business or page purpose, the main service or offer, and the main call to action.',
  'Keep it to 2 to 4 sentences.',
  'Do not list sections.',
  'Do not mention type, heading, or description fields.',
];

const JSON_OUTPUT_RULES = [
  'Keep the page summary and descriptions concise.',
  'Return valid JSON only.',
  'Do not include Markdown.',
  'Do not include code fences.',
  `Use this exact shape:
${JSON_OUTPUT_EXACT_SHAPE}`,
];

function formatRules(rules: string[]) {
  return rules.map((rule) => `- ${rule}`).join('\n');
}

export const EXTRACT_REQUEST_DETAILS_SYSTEM_PROMPT = `
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
`;

export function buildWebsitePreviewAgentInstructions() {
  return `
        You are a website preview assistant.

        Your job is to orchestrate the interaction, not to re-implement
        section analysis rules. Use the website-page-analyzer skill for
        filtering, classification, and page analysis after fetching the page.

        Rules:
        - If the user has not selected an output format, ask:
          "${FORMAT_SELECTION_QUESTION}"
        - Do not fetch or analyze the page until the user selects a format.
        - If the URL and output format are both already provided, do not ask again.
        - After the format is clear, use the website fetch tool.
        - Base the answer only on content returned by the tool and the analyzer skill.
        - Do not make unsupported claims about the page.

        If the user selects "text":
        ${formatRules(TEXT_OUTPUT_RULES)}

        If the user selects "structured JSON":
        ${formatRules(JSON_OUTPUT_RULES)}
    `;
}

export function buildSummarizePageSystemPrompt(format: OutputFormat) {
  const outputRules = format === 'text' ? TEXT_OUTPUT_RULES : JSON_OUTPUT_RULES;

  return `
        You analyze extracted website page sections.

        Rules:
        ${formatRules([...SECTION_ANALYSIS_RULES, ...outputRules])}
    `;
}

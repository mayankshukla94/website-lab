import { createSkill } from '@mastra/core/skills';

export const websitePageAnalyzerSkill = createSkill({
  name: 'website-page-analyzer',
  description:
    'Use when a fetched website page needs to be filtered, classified, and summarized from its extracted sections.',

  instructions: `
        Analyze the candidate sections returned by the website fetch tool.

        Section filtering:
        - Ignore empty sections.
        - Ignore utility sections such as phone wrappers, navigation helpers,
          mobile controls, and decorative containers.
        - Include only sections that contain meaningful page content.

        Section classification:
        - Prefer explicit semantic class names over content-based inference.
        - If className contains "hero-section", classify the section as "hero".
        - If className contains "shoutout", classify the section as "shoutout".
        - When className is generic, infer the type from the heading and text.
        - Use one of these standard section types whenever applicable:
            - hero
            - about
            - services
            - shoutout
            - testimonials
            - case-results
            - attorneys
            - practice-areas
            - contact
            - faq
            - blog
            - call-to-action
        - Return "unknown" when there is not enough evidence to select a standard type.
        - Section types must be lowercase and use kebab-case.

        Page analysis:
        - Explain what the current page is primarily about.
        - Base the page summary only on meaningful sections.
        - Preserve the original section order.
        - Keep the page summary and section descriptions concise.

        For every meaningful section, return:
        - type
        - heading
        - description
    `,
});

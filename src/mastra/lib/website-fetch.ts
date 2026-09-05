import { z } from 'zod';
import * as cheerio from 'cheerio';

export const websiteFetchInputSchema = z.object({
  url: z.url(),
});

export const websiteFetchOutputSchema = z.object({
  url: z.url(),
  statusCode: z.number(),
  contentType: z.string(),
  sections: z.array(
    z.object({
      index: z.number(),
      className: z.string(),
      heading: z.string(),
      text: z.string(),
    }),
  ),
});

export async function fetchWebsitePage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Website Importer',
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
        $(element).find('h1, h2, h3').first().text().trim() ||
        'Untitled Section';

      const text = $(element).text().replace(/\s+/g, ' ').trim();

      const className = $(element).attr('class') ?? '';

      const truncatedText =
        text.length <= 300
          ? text
          : `${text
              .slice(0, 300)
              .replace(/\s+\S*$/, '')
              .trimEnd()}...`;

      return {
        index,
        className,
        heading,
        text: truncatedText,
      };
    })
    .get();

  return {
    url,
    statusCode: response.status,
    contentType: response.headers.get('content-type') || 'unknown',
    sections,
  };
}

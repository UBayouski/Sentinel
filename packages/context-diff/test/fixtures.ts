import type { AdfDoc } from "../src/types.js";

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const h = (level: number, text: string) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });

export const specDoc: AdfDoc = {
  type: "doc",
  version: 1,
  content: [
    p("Owner: Payments team. Tracks PAY-12."),
    h(2, "Retry policy"),
    p("Failed card payments are retried 3 times with exponential backoff."),
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [p("First retry after 1 minute")] },
        { type: "listItem", content: [p("Last retry after 1 hour")] },
      ],
    },
    h(2, "Refunds"),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [p("Full refund")] },
            { type: "tableCell", content: [p("Within 30 days")] },
          ],
        },
      ],
    },
    h(4, "Deep detail"),
    p("Refund webhooks fire once."),
    h(2, "Retry policy"),
    p("Duplicate heading on purpose."),
  ],
};

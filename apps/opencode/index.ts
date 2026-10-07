/**
 * annotaitr Plugin for OpenCode
 *
 * Provides interactive markdown annotation in the browser. Image mode is not
 * exposed here yet (see docs/superpowers/specs for the phase-2 plan).
 * When the agent calls annotate_markdown, the UI opens for the user to
 * review, annotate, or approve the markdown file.
 *
 * Environment variables:
 *   ANNOTAITR_PORT    - Port or inclusive range, e.g. 3000 or 3000-3010
 *   ANNOTAITR_BROWSER - Custom browser application
 *   (MD_ANNOTATOR_* still works as a deprecated fallback)
 */

import { type Plugin, tool } from "@opencode-ai/plugin";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Import from shared server modules
import { buildMarkdownServer } from "../../server/markdown/adapter.js";
import { formatApprovalOutput } from "../../server/markdown/feedback.js";
import { openBrowser } from "../../server/core/browser.js";

// Load HTML content at runtime
const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlContent = readFileSync(join(__dirname, "..", "annotator.html"), "utf-8");

// Helper for delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const MdAnnotatorPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      annotate_markdown: tool({
        description:
          "Open markdown file(s) for interactive user annotation and review. The user can highlight text to mark deletions or add comments, then submit feedback. Every numbered note states its intent after the number (`## 3. Question · Text (Line 7)`): Change applies the comment, Add inserts text or adds what the comment asks, Remove deletes, Question asks without requesting an edit. Numbers stay fixed for the round, so they can have gaps. Optionally pass feedbackNotes to display AI notes about changes made.",
        args: {
          filePath: tool.schema
            .string()
            .optional()
            .describe("Absolute path to a single markdown file to annotate"),
          filePaths: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Array of absolute paths to markdown files to annotate"),
          feedbackNotes: tool.schema
            .array(
              tool.schema.object({
                text: tool.schema.string().describe("Note text explaining the change"),
                line: tool.schema.number().optional().describe("Line number in the file (omit for general notes)"),
              })
            )
            .optional()
            .describe("AI notes to display as read-only annotations in the UI"),
        },

        async execute(args) {
          const paths = args.filePaths || (args.filePath ? [args.filePath] : []);
          if (paths.length === 0) {
            return "ERROR: No file paths provided.";
          }

          const server = await buildMarkdownServer({
            filePaths: paths,
            origin: "opencode",
            htmlContent,
            feedbackNotes: args.feedbackNotes || null,
            onReady: async (url: string) => {
              await openBrowser(url);
            },
          });

          const result = await server.waitForDecision();

          // Give browser time to receive response
          await sleep(500);

          server.stop();

          if (result.disconnected) {
            return "CANCELLED: Browser tab was closed — no decision made.";
          }

          if (result.approved) {
            return formatApprovalOutput(result);
          }

          return result.feedback || "No feedback provided.";
        },
      }),
    },

    // Listen for /annotate:md command
    event: async ({ event }) => {
      const isCommandEvent =
        event.type === "command.executed" ||
        event.type === "tui.command.execute";

      // @ts-ignore - Event structure
      const commandName =
        event.properties?.name || event.command || event.payload?.name;
      const isAnnotateCommand = commandName === "annotate:md";

      if (isCommandEvent && isAnnotateCommand) {
        ctx.client.app.log({
          level: "info",
          message: "Use the annotate_markdown tool with a file path to open the annotation UI.",
        });
      }
    },
  };
};

export default MdAnnotatorPlugin;

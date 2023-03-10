import { Env } from "https://deno.land/x/env@v2.2.0/env.js";
import { Manifest } from "deno-slack-sdk/mod.ts";
import { ReplyWorkflow } from "./workflows/reply_workflow.ts";

const env = new Env();

/**
 * The app manifest contains the app's configuration. This
 * file defines attributes like app name and description.
 * https://api.slack.com/future/manifest
 */
export default Manifest({
  name: env.get("SLACK_APP_NAME", "gpt-bot") as string,
  displayName: env.get("SLACK_APP_DISPLAY_NAME", undefined),
  description: "Slack bot using OpenAI ChatGPT API",
  icon: "assets/icon.png",
  workflows: [ReplyWorkflow],
  outgoingDomains: ["api.openai.com", "esm.sh"],
  botScopes: ["app_mentions:read", "chat:write", "chat:write.public"],
});

import { Manifest } from "deno-slack-sdk/mod.ts";
import { ReplyWorkflow } from "./workflows/reply_workflow.ts";
import { env } from "./.env.ts";

/**
 * The app manifest contains the app's configuration. This
 * file defines attributes like app name and description.
 * https://api.slack.com/future/manifest
 */
export default Manifest({
  name: env.SLACK_APP_NAME,
  displayName: env.SLACK_APP_DISPLAY_NAME,
  description: "Slack bot using OpenAI ChatGPT API",
  icon: "assets/icon.png",
  workflows: [ReplyWorkflow],
  outgoingDomains: ["api.openai.com", "esm.sh"],
  botScopes: ["app_mentions:read", "chat:write", "chat:write.public"],
});

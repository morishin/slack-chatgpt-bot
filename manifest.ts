import { Manifest } from "deno-slack-sdk/mod.ts";
import { ReplyWorkflow } from "./workflows/reply_workflow.ts";
import MessageHistoryDatastore from "./datastores/message_history_datastore.ts";
import { env } from "./.env.ts";

export default Manifest({
  name: env.SLACK_APP_NAME,
  displayName: env.SLACK_APP_DISPLAY_NAME,
  description: "Slack bot using OpenAI ChatGPT API",
  icon: "assets/icon.png",
  workflows: [ReplyWorkflow],
  outgoingDomains: ["api.openai.com", "esm.sh"],
  datastores: [MessageHistoryDatastore],
  botScopes: [
    "app_mentions:read",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
  ],
});

import { Manifest } from "deno-slack-sdk/mod.ts";
import { env } from "./.env.ts";
import { MessageHistoryDatastore } from "./datastores/message_history_datastore.ts";
import { MessageType } from "./functions/types/message_type.ts";
import { ReplyWorkflow } from "./workflows/reply_workflow.ts";
import { ConfigureSystemMessageWorkflow } from "./workflows/configure_system_message_workflow.ts";
import { ConfigureChannelsWorkflow } from "./workflows/configure_channels_workflow.ts";

export default Manifest({
  name: env.SLACK_APP_NAME,
  displayName: env.SLACK_APP_DISPLAY_NAME,
  description: "Slack bot using OpenAI ChatGPT API",
  icon: "assets/icon.png",
  workflows: [
    ReplyWorkflow,
    ConfigureSystemMessageWorkflow,
    ConfigureChannelsWorkflow,
  ],
  types: [MessageType],
  outgoingDomains: ["api.openai.com"],
  datastores: [MessageHistoryDatastore],
  botScopes: [
    "app_mentions:read",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
    "triggers:read",
    "triggers:write",
  ],
});

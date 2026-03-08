import { Manifest } from "deno-slack-sdk/mod.ts";
import { env } from "./env.ts";
import { ConversationSessionDatastore } from "./datastores/conversation_session_datastore.ts";
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
  outgoingDomains: ["api.openai.com"],
  datastores: [ConversationSessionDatastore],
  botScopes: [
    "app_mentions:read",
    "channels:history",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
    "triggers:read",
    "triggers:write",
  ],
});

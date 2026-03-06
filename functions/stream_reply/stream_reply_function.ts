import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { generateText } from "npm:ai";
import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from "npm:@ai-sdk/openai";

import { ConversationSessionDatastore } from "../../datastores/conversation_session_datastore.ts";
import { env } from "../../env.ts";

export const StreamReplyFunctionDefinition = DefineFunction({
  callback_id: "stream_reply_function",
  title: "Stream reply function",
  source_file: "functions/stream_reply/stream_reply_function.ts",
  input_parameters: {
    properties: {
      channelId: {
        type: Schema.types.string,
      },
      systemMessage: {
        type: Schema.types.string,
      },
    },
    required: ["channelId", "systemMessage"],
  },
  output_parameters: {
    properties: {
      reply: {
        type: Schema.types.string,
      },
    },
    required: ["reply"],
  },
});

type OpenAIProviderMetadata = {
  openai?: {
    responseId?: string | null;
  };
};

type ConversationSession = {
  previousResponseId?: string;
  lastInteractionAt?: number;
};

const trimMention = (message: string): string => {
  return message.replace(/<@.+>\s?/, "").trim();
};

const isBlank = (text: string): boolean => {
  return text.replaceAll(/\s/g, "").length === 0;
};

const getChainTimeoutMs = (timeoutMinutes: number): number => {
  return timeoutMinutes * 60 * 1000;
};

const getPreviousResponseId = (
  session: ConversationSession,
  nowMs: number,
  timeoutMs: number,
): string | undefined => {
  if (!session.previousResponseId || !session.lastInteractionAt) {
    return undefined;
  }
  const elapsedMs = nowMs - session.lastInteractionAt;
  if (elapsedMs > timeoutMs) {
    return undefined;
  }
  return session.previousResponseId;
};

const extractResponseId = (
  providerMetadata: OpenAIProviderMetadata | undefined,
): string | undefined => {
  const responseId = providerMetadata?.openai?.responseId;
  return typeof responseId === "string" && responseId.length > 0
    ? responseId
    : undefined;
};

export const streamReplyInternals = {
  getChainTimeoutMs,
  getPreviousResponseId,
};

export default SlackFunction(
  StreamReplyFunctionDefinition,
  async ({ inputs, client, env: slackEnv }) => {
    const content = trimMention(inputs.systemMessage);
    if (isBlank(content)) {
      console.log("Skipping: StreamReplyFunction (empty message)");
      return {
        outputs: {
          reply: "",
        },
      };
    }

    const timeoutMs = getChainTimeoutMs(env.RESPONSE_CHAIN_TIMEOUT_MINUTES);
    const sessionChannelId = inputs.channelId;

    const sessionResponse = await client.apps.datastore.get<
      typeof ConversationSessionDatastore.definition
    >({
      datastore: "ConversationSession",
      id: sessionChannelId,
    });
    if (!sessionResponse.ok) {
      return {
        error: `Failed to get conversation session: ${sessionResponse.error}`,
      };
    }

    const nowMs = Date.now();
    const systemMessage = sessionResponse.item?.systemMessage as
      | string
      | undefined ?? env.INITIAL_SYSTEM_MESSAGE;
    const previousResponseId = getPreviousResponseId(
      {
        previousResponseId: sessionResponse.item?.previousResponseId as
          | string
          | undefined,
        lastInteractionAt: sessionResponse.item?.lastInteractionAt as
          | number
          | undefined,
      },
      nowMs,
      timeoutMs,
    );

    const openAIOptions: OpenAILanguageModelResponsesOptions = {
      instructions: systemMessage,
      ...(previousResponseId ? { previousResponseId } : {}),
    };

    const openAI = createOpenAI({ apiKey: slackEnv.OPENAI_API_KEY });
    console.log("Slack reply mode: non-streaming");

    let result;
    try {
      result = await generateText({
        model: openAI(env.GPT_MODEL),
        prompt: content,
        providerOptions: {
          openai: openAIOptions,
        },
      });
    } catch (error) {
      console.warn(
        `OpenAI reply request failed. Falling back to static message. Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      const reply =
        "Failed to generate a response. Please try again in a moment.";
      await client.chat.postMessage({
        channel: inputs.channelId,
        text: reply,
      });
      return {
        outputs: {
          reply,
        },
      };
    }

    const reply = result.text;
    await client.chat.postMessage({
      channel: inputs.channelId,
      text: reply,
    });

    const responseId = extractResponseId(
      result.providerMetadata as OpenAIProviderMetadata | undefined,
    );

    if (responseId) {
      const updateSessionResponse = await client.apps.datastore.update<
        typeof ConversationSessionDatastore.definition
      >({
        datastore: "ConversationSession",
        item: {
          channelId: sessionChannelId,
          systemMessage,
          previousResponseId: responseId,
          lastInteractionAt: nowMs,
        },
      });

      if (!updateSessionResponse.ok) {
        return {
          error:
            `Failed to save conversation session: ${updateSessionResponse.error}`,
        };
      }
    } else {
      console.warn(
        "OpenAI responseId is missing; session chain was not updated.",
      );
    }

    return {
      outputs: {
        reply,
      },
    };
  },
);

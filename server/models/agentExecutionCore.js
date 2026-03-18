import OpenAI from "openai";

import { executeMcpTool } from "./mcpManager.js";
import { getEndpointCandidatesForModel } from "../utils/modelSelection.js";

export function normalizeBaseUrlCandidates(baseUrl) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  const root = trimmed.replace(/\/api\/v1$/, "").replace(/\/v1$/, "");
  const candidates = [trimmed];

  if (root && `${root}/v1` !== trimmed) {
    candidates.push(`${root}/v1`);
  }
  if (root && `${root}/api/v1` !== trimmed) {
    candidates.push(`${root}/api/v1`);
  }

  return [...new Set(candidates)];
}

function createOpenAIClient(apiKey, baseURL) {
  return new OpenAI({ apiKey, baseURL });
}

function defaultUnsupportedStreamOptionsError(error, getErrorMessage) {
  const message = String(
    getErrorMessage?.(error) || error?.message || ""
  ).toLowerCase();
  return (
    message.includes("stream_options") ||
    message.includes("unknown parameter") ||
    message.includes("unsupported") ||
    message.includes("include_usage")
  );
}

export async function requestAgentTurnWithFallback({
  uid,
  modelCandidates,
  messages,
  openaiTools,
  stream = false,
  resolveGenerationConfig,
  getErrorMessage = (error) => String(error?.message || error || ""),
  isUnsupportedStreamOptionsError,
  onAttemptStart,
  onAttemptFailed,
  onStreamOptionsRetry,
}) {
  let lastError = null;

  for (const modelId of modelCandidates) {
    for (const endpoint of getEndpointCandidatesForModel(uid, modelId)) {
      for (const baseURL of normalizeBaseUrlCandidates(endpoint.base_url)) {
        const client = createOpenAIClient(endpoint.api_key, baseURL);
        const endpointGenerationConfig = resolveGenerationConfig(
          endpoint,
          modelId
        );
        const params = {
          model: modelId,
          messages,
          tools: openaiTools?.length ? openaiTools : undefined,
          ...endpointGenerationConfig,
          ...(stream ? { stream: true } : {}),
        };

        try {
          onAttemptStart?.({
            modelId,
            endpoint,
            baseURL,
            endpointGenerationConfig,
            params,
          });

          if (!stream) {
            const completion = await client.chat.completions.create(params);
            return {
              ok: true,
              mode: "completion",
              modelId,
              endpoint,
              baseURL,
              endpointGenerationConfig,
              client,
              completion,
            };
          }

          let retriedWithoutStreamOptions = false;
          let streamResult;
          try {
            streamResult = await client.chat.completions.create({
              ...params,
              stream_options: { include_usage: true },
            });
          } catch (error) {
            const isUnsupportedError = (
              isUnsupportedStreamOptionsError ||
              defaultUnsupportedStreamOptionsError
            )(error, getErrorMessage);
            if (!isUnsupportedError) {
              throw error;
            }
            retriedWithoutStreamOptions = true;
            onStreamOptionsRetry?.({
              modelId,
              endpoint,
              baseURL,
              error,
              endpointGenerationConfig,
            });
            streamResult = await client.chat.completions.create(params);
          }

          return {
            ok: true,
            mode: "stream",
            modelId,
            endpoint,
            baseURL,
            endpointGenerationConfig,
            client,
            stream: streamResult,
            retriedWithoutStreamOptions,
          };
        } catch (error) {
          lastError = error;
          onAttemptFailed?.({
            modelId,
            endpoint,
            baseURL,
            error,
            errorMessage: getErrorMessage(error),
          });
        }
      }
    }
  }

  return {
    ok: false,
    lastError,
    lastErrorMessage: getErrorMessage(lastError),
  };
}

export function normalizeToolCallResult(result) {
  return (
    (result?.content || [])
      .map((item) =>
        typeof item?.text === "string" ? item.text : JSON.stringify(item)
      )
      .join("\n") || JSON.stringify(result)
  );
}

export async function executeAgentToolCall({
  uid,
  requestTools,
  toolCall,
  signal,
  executionScope,
}) {
  const toolName = String(toolCall?.function?.name || "").trim();
  const toolDef = (Array.isArray(requestTools) ? requestTools : []).find(
    (tool) => tool?.function?.name === toolName
  );

  if (!toolDef) {
    return {
      ok: false,
      toolName,
      toolCallId: toolCall?.id || "",
      args: null,
      errorMessage: "Tool not found or access denied.",
    };
  }

  try {
    const args = JSON.parse(toolCall?.function?.arguments || "{}");
    const result = await executeMcpTool(
      uid,
      toolDef._mcp_server_id,
      toolName,
      args,
      {
        signal,
        executionScope,
      }
    );

    return {
      ok: true,
      toolName,
      toolCallId: toolCall?.id || "",
      args,
      result,
      resultText: normalizeToolCallResult(result),
      toolDef,
    };
  } catch (error) {
    return {
      ok: false,
      toolName,
      toolCallId: toolCall?.id || "",
      args: null,
      errorMessage: error?.message || String(error || "Tool execution failed"),
      error,
      toolDef,
    };
  }
}

export async function requestForcedFinalAgentResponse({
  client,
  modelId,
  messages,
  wrapUpPrompt,
  generationConfig = {},
  onUsage,
}) {
  const completion = await client.chat.completions.create({
    model: modelId,
    messages: [
      ...messages,
      {
        role: "user",
        content: wrapUpPrompt,
      },
    ],
    ...generationConfig,
  });

  onUsage?.(completion.usage);
  return String(completion.choices?.[0]?.message?.content || "").trim();
}

import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { Sidebar } from "@/components/Sidebar";
import { SystemPromptModal } from "@/components/SystemPromptModal";
import { useShellPreferences } from "@/hooks/useShellPreferences";
import {
  createConversation,
  deleteConversation,
  getConversations,
  getMessages,
  summarizeConversationTitle,
  updateConversation,
} from "@/services/api";
import {
  AppstoreOutlined,
  BugOutlined,
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MenuOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  StopOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/stores/useAppStore";
import { createAuthHeaders, resolveApiUrl } from "@/services/request";
import {
  Avatar,
  Button,
  ConfigProvider,
  Drawer,
  Input,
  Layout,
  Popconfirm,
  Switch,
  Tooltip,
  Upload,
  message as antdMessage,
  theme as antdTheme,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";

const { Sider, Content } = Layout;
const { TextArea } = Input;

// 将图片文件转为 base64
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // 只保留 base64 数据部分
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
  });

// 从存储内容中提取显示文本（去掉图片数据）
const extractDisplayContent = (content: string): string => {
  return content.replace(/\[IMAGE_DATA:[^\]]+\]/g, "[📷 图片]");
};

// 检查消息是否包含图片
const hasImage = (content: string): boolean => content.includes("[IMAGE_DATA:");

const getToolMessageName = (message: API.Message): string => {
  if (message.name) return message.name;

  const runningMatch = String(message.content || "").match(
    /^🔧 正在执行工具：(.+?)\.\.\.$/
  );
  return runningMatch?.[1] || "工具执行";
};

const getToolMessageStatus = (
  message: API.Message
): "running" | "error" | "success" => {
  const content = String(message.content || "");
  if (content.startsWith("🔧 正在执行工具：")) {
    return "running";
  }

  if (/error|failed|失败/i.test(content)) {
    return "error";
  }

  return "success";
};

const STREAM_FLUSH_INTERVAL = 16;
const STREAM_SEGMENT_DRAIN_INTERVAL = 20;
const TITLE_REFRESH_DELAYS = [1200, 2600, 5000, 9000];

type ChatDebugEvent = {
  id: string;
  timestamp?: string;
  phase?: string;
  [key: string]: any;
};

const splitIncomingStreamContent = (text: string): string[] => {
  const raw = String(text || "");
  if (!raw) return [];

  // 打字机模式：按字符（含中文）逐步输出，标点优先单独落字。
  const chars = Array.from(raw);
  const segments: string[] = [];
  let buffer = "";

  for (const ch of chars) {
    buffer += ch;
    if (/[。！？!?；;，,\s\n]/.test(ch) || buffer.length >= 3) {
      segments.push(buffer);
      buffer = "";
    }
  }
  if (buffer) segments.push(buffer);
  return segments;
};

const getResponseErrorMessage = async (response: Response) => {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return (
        data?.error?.message ||
        data?.error ||
        data?.message ||
        `请求失败 (${response.status})`
      );
    }

    const text = await response.text();
    return text || `请求失败 (${response.status})`;
  } catch (error) {
    return `请求失败 (${response.status})`;
  }
};

export default () => {
  const { currentUser, isLoggedIn } = useAppStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedConversationId = searchParams.get("conversationId");
  const [messageApi, messageContextHolder] = antdMessage.useMessage();
  const {
    moduleExpanded,
    setModuleExpanded,
    themeMode,
    resolvedTheme,
    setThemeMode,
    isDark,
  } = useShellPreferences();

  // UI 状态
  const [moduleDrawerVisible, setModuleDrawerVisible] = useState(false);
  const [conversationDrawerVisible, setConversationDrawerVisible] =
    useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // 对话状态
  const [conversations, setConversations] = useState<API.Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<API.Message[]>([]);

  // 输入状态
  const [inputText, setInputText] = useState("");
  const [pendingImages, setPendingImages] = useState<
    { file: File; preview: string }[]
  >([]);

  // 流式处理状态
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 设置弹窗

  // System Prompt
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const currentConv = conversations.find((c) => c.id === currentConvId) ?? null;
  const currentSystemPrompt = currentConv?.system_prompt ?? "";
  const currentContextWindow = currentConv?.context_window ?? null;

  // 对话重命名状态
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // 消息编辑状态
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState("");
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugDrawerVisible, setDebugDrawerVisible] = useState(false);
  const [debugEventsByConversation, setDebugEventsByConversation] = useState<
    Record<string, ChatDebugEvent[]>
  >({});

  // 会话搜索状态
  const [searchQuery, setSearchQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentConvIdRef = useRef<string | null>(null);
  const shouldRefocusInputRef = useRef(false);
  const streamBufferRef = useRef("");
  const streamErrorRef = useRef<string | null>(null);
  const streamTargetIndexRef = useRef<number | null>(null);
  const streamFlushTimerRef = useRef<number | null>(null);
  const sseRemainderRef = useRef("");
  const streamSegmentQueueRef = useRef<string[]>([]);
  const streamSegmentDrainTimerRef = useRef<number | null>(null);
  const debugEventCounterRef = useRef(0);

  // 响应式监听
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    currentConvIdRef.current = currentConvId;
  }, [currentConvId]);

  // 登录检查 & 初始化
  useEffect(() => {
    if (!isLoggedIn) return;
    loadInitData();
  }, [isLoggedIn]);

  useEffect(() => {
    if (
      !requestedConversationId ||
      currentConvId === requestedConversationId ||
      !conversations.some((conv) => String(conv.id) === requestedConversationId)
    ) {
      return;
    }

    handleSelectConversation(requestedConversationId);
  }, [requestedConversationId, conversations, currentConvId]);

  useEffect(() => {
    const handleHistoryCleared = () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      if (streamSegmentDrainTimerRef.current !== null) {
        window.clearTimeout(streamSegmentDrainTimerRef.current);
        streamSegmentDrainTimerRef.current = null;
      }
      streamBufferRef.current = "";
      streamErrorRef.current = null;
      streamTargetIndexRef.current = null;
      streamSegmentQueueRef.current = [];
      sseRemainderRef.current = "";
      setLoading(false);
      setInputText("");
      setPendingImages((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.preview));
        return [];
      });
      setConversations([]);
      setCurrentConvId(null);
      setMessages([]);
      setSearchQuery("");
      setDebugEventsByConversation({});
    };
    window.addEventListener("cw.history.cleared", handleHistoryCleared);
    return () =>
      window.removeEventListener("cw.history.cleared", handleHistoryCleared);
  }, []);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleCreateChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [conversations]);

  const loadInitData = async () => {
    try {
      const convs = await getConversations();

      setConversations(convs);
      if (convs.length > 0) {
        const initialConversationId =
          requestedConversationId &&
          convs.some((conv) => String(conv.id) === requestedConversationId)
            ? requestedConversationId
            : convs[0].id;
        handleSelectConversation(initialConversationId);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const refreshConversations = async () => {
    try {
      const convs = await getConversations();
      setConversations(convs);
    } catch (error) {
      console.error(error);
    }
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth",
      block: "end",
    });
  }, [loading]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current);
      }
      if (streamSegmentDrainTimerRef.current !== null) {
        window.clearTimeout(streamSegmentDrainTimerRef.current);
      }
    };
  }, []);

  const flushPendingStreamSegmentsNow = useCallback(() => {
    if (streamSegmentDrainTimerRef.current !== null) {
      window.clearTimeout(streamSegmentDrainTimerRef.current);
      streamSegmentDrainTimerRef.current = null;
    }
    if (streamSegmentQueueRef.current.length > 0) {
      streamBufferRef.current += streamSegmentQueueRef.current.join("");
      streamSegmentQueueRef.current = [];
    }
  }, []);

  const appendDebugEvent = useCallback(
    (conversationId: string | null, event: Record<string, any>) => {
      if (!conversationId) return;

      setDebugEventsByConversation((prev) => {
        const nextEvent: ChatDebugEvent = {
          id: `${conversationId}-${debugEventCounterRef.current++}`,
          ...event,
        };
        const currentEvents = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: [...currentEvents, nextEvent].slice(-500),
        };
      });
    },
    []
  );

  useEffect(() => {
    if (loading || !shouldRefocusInputRef.current) return;
    shouldRefocusInputRef.current = false;
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [loading]);

  const flushStreamBuffer = useCallback(() => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }

    const targetIndex = streamTargetIndexRef.current;
    const bufferedContent = streamBufferRef.current;
    const bufferedError = streamErrorRef.current;

    if (targetIndex === null) return;
    if (!bufferedContent && !bufferedError) return;

    streamBufferRef.current = "";
    streamErrorRef.current = null;

    setMessages((prev) => {
      if (targetIndex === null || !prev[targetIndex]) return prev;

      const next = [...prev];
      const target = next[targetIndex];
      if (!target || target.role !== "assistant") return prev;

      next[targetIndex] = {
        ...target,
        content: bufferedError
          ? `❌ 错误：${bufferedError}`
          : `${target.content}${bufferedContent}`,
      };
      return next;
    });
  }, []);

  const scheduleStreamFlush = useCallback(() => {
    if (streamFlushTimerRef.current !== null) return;
    streamFlushTimerRef.current = window.setTimeout(() => {
      flushStreamBuffer();
    }, STREAM_FLUSH_INTERVAL);
  }, [flushStreamBuffer]);

  const scheduleSegmentDrain = useCallback(() => {
    if (streamSegmentDrainTimerRef.current !== null) return;

    const drain = () => {
      if (streamSegmentQueueRef.current.length === 0) {
        streamSegmentDrainTimerRef.current = null;
        return;
      }

      const piece = streamSegmentQueueRef.current.shift();
      if (piece) {
        streamBufferRef.current += piece;
        scheduleStreamFlush();
      }
      streamSegmentDrainTimerRef.current = window.setTimeout(
        drain,
        STREAM_SEGMENT_DRAIN_INTERVAL
      );
    };

    streamSegmentDrainTimerRef.current = window.setTimeout(drain, 0);
  }, [scheduleStreamFlush]);

  const appendAssistantChunk = useCallback(
    (content?: string, error?: string) => {
      if (content) {
        const segments = splitIncomingStreamContent(content);
        if (segments.length <= 1) {
          streamBufferRef.current += segments[0] || content;
          scheduleStreamFlush();
        } else {
          streamSegmentQueueRef.current.push(...segments);
          scheduleSegmentDrain();
        }
      }
      if (error) {
        streamErrorRef.current = error;
        flushPendingStreamSegmentsNow();
        flushStreamBuffer();
        return;
      }
    },
    [
      flushPendingStreamSegmentsNow,
      flushStreamBuffer,
      scheduleSegmentDrain,
      scheduleStreamFlush,
    ]
  );

  const createAssistantPlaceholder = useCallback(async () => {
    streamBufferRef.current = "";
    streamErrorRef.current = null;
    sseRemainderRef.current = "";
    flushPendingStreamSegmentsNow();

    await new Promise<void>((resolve) => {
      setMessages((prev) => {
        const nextIndex = prev.length;
        streamTargetIndexRef.current = nextIndex;
        resolve();
        return [...prev, { role: "assistant", content: "" }];
      });
    });
  }, [flushPendingStreamSegmentsNow]);

  const replaceAssistantMessage = useCallback(
    (index: number | null, content: string) => {
      if (index === null || !content) return;
      streamBufferRef.current = "";
      streamErrorRef.current = null;
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }

      setMessages((prev) => {
        if (!prev[index]) return prev;
        const next = [...prev];
        const target = next[index];
        if (!target || target.role !== "assistant") return prev;
        next[index] = { ...target, content };
        return next;
      });
    },
    []
  );

  const processSseChunk = useCallback(
    (
      rawChunk: string,
      handlers: {
        onData: (parsed: any) => void;
      }
    ) => {
      const combined = sseRemainderRef.current + rawChunk;
      const parts = combined.split("\n");
      sseRemainderRef.current = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const data = part.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          handlers.onData(JSON.parse(data));
        } catch (e) {
          // ignore partial parse errors and malformed lines
        }
      }
    },
    []
  );

  const flushSseRemainder = useCallback(
    (handlers: { onData: (parsed: any) => void }) => {
      if (!sseRemainderRef.current.trim()) return;
      processSseChunk("\n", handlers);
    },
    [processSseChunk]
  );

  const syncConversationMessages = useCallback(async (convId: string) => {
    try {
      const latest = await getMessages(convId);
      if (currentConvIdRef.current === convId) {
        setMessages(latest);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleCreateChat = async () => {
    try {
      const newConv = await createConversation("新对话");
      setConversations((prev) => [newConv, ...prev]);
      setCurrentConvId(newConv.id);
      setMessages([]);
      if (isMobile) setConversationDrawerVisible(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectConversation = async (id: string) => {
    setCurrentConvId(id);
    try {
      const msgs = await getMessages(id);
      setMessages(msgs);
    } catch (error) {
      console.error(error);
    }
    if (isMobile) setConversationDrawerVisible(false);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      const newConvs = conversations.filter((c) => c.id !== id);
      setConversations(newConvs);
      if (currentConvId === id) {
        if (newConvs.length > 0) {
          handleSelectConversation(newConvs[0].id);
        } else {
          setCurrentConvId(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleRenameStart = (conv: API.Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleRenameConfirm = async () => {
    if (!editingTitleId || !editingTitle.trim()) {
      setEditingTitleId(null);
      return;
    }
    try {
      await updateConversation(editingTitleId, editingTitle.trim());
      setConversations((prev) =>
        prev.map((c) =>
          c.id === editingTitleId ? { ...c, title: editingTitle.trim() } : c
        )
      );
    } catch (e) {
      console.error(e);
    }
    setEditingTitleId(null);
  };

  const handleSaveSystemPrompt = async (
    prompt: string,
    contextWindow: number | null
  ) => {
    if (!currentConvId) return;
    try {
      await updateConversation(
        currentConvId,
        undefined as any,
        prompt,
        undefined,
        contextWindow
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId
            ? { ...c, system_prompt: prompt, context_window: contextWindow }
            : c
        )
      );
      messageApi.success("对话设置已保存");
    } catch (e) {
      messageApi.error("保存失败");
    }
  };

  // 核心发送函数（兼容 send + regenerate）
  const streamChat = async (
    convId: string,
    userMsg: API.Message | null,
    isRegenerate = false
  ) => {
    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let sawAssistantContent = false;
    let sawAssistantError = false;

    try {
      await createAssistantPlaceholder();
      const url = resolveApiUrl(
        isRegenerate
          ? `/api/conversations/${convId}/regenerate`
          : `/api/conversations/${convId}/chat`
      );

      let body: any = {};
      if (!isRegenerate && userMsg) {
        body.message =
          userMsg.content.replace(/\[IMAGE_DATA:[^\]]+\]/g, "").trim() ||
          userMsg.content;
        // 提取图片 base64
        const imgMatches = [
          ...userMsg.content.matchAll(/\[IMAGE_DATA:([^\]]+)\]/g),
        ];
        if (imgMatches.length > 0) {
          body.images = imgMatches.map((m) => m[1]);
          body.message = userMsg.content
            .replace(/\[IMAGE_DATA:[^\]]+\]/g, "")
            .trim();
        }
      }
      body.debug = debugEnabled;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorMessage = await getResponseErrorMessage(response);
        replaceAssistantMessage(
          streamTargetIndexRef.current,
          `❌ ${errorMessage}`
        );
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        processSseChunk(chunk, {
          onData: (parsed) => {
            if (parsed.type === "debug") {
              appendDebugEvent(convId, parsed);
              return;
            }
            if (parsed.type === "tool_running") {
              flushStreamBuffer();
              setMessages((prev) => {
                const next = [
                  ...prev,
                  {
                    role: "tool" as const,
                    content: `🔧 正在执行工具：${parsed.tool_name}...`,
                  },
                  { role: "assistant" as const, content: "" },
                ];
                streamTargetIndexRef.current = next.length - 1;
                return next;
              });
              sawAssistantContent = false;
              sawAssistantError = false;
            } else {
              if (parsed.content) sawAssistantContent = true;
              if (parsed.error) sawAssistantError = true;
              appendAssistantChunk(parsed.content, parsed.error);
            }

            if (parsed.title) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId ? { ...c, title: parsed.title } : c
                )
              );
            }
          },
        });
      }
      flushSseRemainder({
        onData: (parsed) => {
          if (parsed.type === "debug") {
            appendDebugEvent(convId, parsed);
            return;
          }
          if (parsed.type === "tool_running") {
            flushStreamBuffer();
            setMessages((prev) => {
              const next = [
                ...prev,
                {
                  role: "tool" as const,
                  content: `🔧 正在执行工具：${parsed.tool_name}...`,
                },
                { role: "assistant" as const, content: "" },
              ];
              streamTargetIndexRef.current = next.length - 1;
              return next;
            });
            sawAssistantContent = false;
            sawAssistantError = false;
          } else {
            if (parsed.content) sawAssistantContent = true;
            if (parsed.error) sawAssistantError = true;
            appendAssistantChunk(parsed.content, parsed.error);
          }

          if (parsed.title) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId ? { ...c, title: parsed.title } : c
              )
            );
          }
        },
      });
      flushPendingStreamSegmentsNow();
      flushStreamBuffer();
      if (!sawAssistantContent && !sawAssistantError) {
        replaceAssistantMessage(
          streamTargetIndexRef.current,
          "⚠️ 上游返回空内容，未生成可展示的回复。"
        );
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        if (debugEnabled) {
          appendDebugEvent(convId, {
            timestamp: new Date().toISOString(),
            phase: "client_error",
            error: error.message || "发送失败，请检查网络和 API 配置",
          });
        }
        if (!sawAssistantError) {
          replaceAssistantMessage(
            streamTargetIndexRef.current,
            `❌ ${error.message || "发送失败，请检查网络和 API 配置"}`
          );
        }
        messageApi.error(error.message || "发送失败，请检查网络和 API 配置");
        console.error(error);
      }
    } finally {
      flushPendingStreamSegmentsNow();
      flushStreamBuffer();
      setLoading(false);
      abortControllerRef.current = null;
      streamTargetIndexRef.current = null;
      sseRemainderRef.current = "";
      if (!controller.signal.aborted) {
        await syncConversationMessages(convId);
      }
    }
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && pendingImages.length === 0) || loading) return;

    let convId = currentConvId;
    const shouldSummarizeTitle = messages.length === 0;
    if (!convId) {
      const newConv = await createConversation("新对话");
      setConversations((prev) => [newConv, ...prev]);
      convId = newConv.id;
      setCurrentConvId(convId);
    }

    // 构建用户消息内容（文字 + 图片标记）
    let content = inputText;
    if (pendingImages.length > 0) {
      const base64s = await Promise.all(
        pendingImages.map((p) => fileToBase64(p.file))
      );
      content += "\n" + base64s.map((b) => `[IMAGE_DATA:${b}]`).join("\n");
    }

    const userMsg: API.Message = { role: "user", content };
    const previewsToRevoke = pendingImages.map((p) => p.preview);
    shouldRefocusInputRef.current = true;
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setPendingImages([]);
    previewsToRevoke.forEach((preview) => URL.revokeObjectURL(preview));

    await streamChat(convId, userMsg, false);

    if (shouldSummarizeTitle) {
      summarizeConversationTitle(convId).catch((e) => console.error(e));
      // 异步总结可能耗时较长，分段刷新会话列表以拿到新标题
      TITLE_REFRESH_DELAYS.forEach((delay) => {
        window.setTimeout(() => {
          refreshConversations();
        }, delay);
      });
    }
  };

  const handleRegenerate = async () => {
    if (!currentConvId || loading) return;
    // 删除界面上最后一条 assistant 消息
    setMessages((prev) => {
      const newMsgs = [...prev];
      if (
        newMsgs.length > 0 &&
        newMsgs[newMsgs.length - 1].role === "assistant"
      ) {
        newMsgs.pop();
      }
      return newMsgs;
    });
    await streamChat(currentConvId, null, true);
  };

  const handleSaveEdit = async (msgId: number) => {
    if (!currentConvId || loading || !editingMsgContent.trim()) return;

    const content = editingMsgContent;
    setEditingMsgId(null);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let initialAssistantIndex: number | null = null;
    let sawAssistantContent = false;
    let sawAssistantError = false;

    // 截断界面消息并替换编辑的消息
    const msgIndex = messages.findIndex((m) => m.id === msgId);
    if (msgIndex !== -1) {
      const updatedMessages = messages.slice(0, msgIndex);
      const editedMsg = { ...messages[msgIndex], content };
      updatedMessages.push(editedMsg);
      // 添加空 assistant 消息占位
      updatedMessages.push({ role: "assistant", content: "" });
      setMessages(updatedMessages);
      initialAssistantIndex = updatedMessages.length - 1;
    }

    try {
      const url = resolveApiUrl(
        `/api/conversations/${currentConvId}/messages/${msgId}`
      );

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeaders(),
        },
        body: JSON.stringify({
          content,
          debug: debugEnabled,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorMessage = await getResponseErrorMessage(response);
        replaceAssistantMessage(
          streamTargetIndexRef.current,
          `❌ ${errorMessage}`
        );
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      streamTargetIndexRef.current = initialAssistantIndex;
      streamBufferRef.current = "";
      streamErrorRef.current = null;
      sseRemainderRef.current = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        processSseChunk(chunk, {
          onData: (parsed) => {
            if (parsed.type === "debug") {
              appendDebugEvent(currentConvId, parsed);
              return;
            }
            if (parsed.type === "tool_running") {
              flushStreamBuffer();
              setMessages((prev) => {
                const next = [
                  ...prev,
                  {
                    role: "tool" as const,
                    content: `🔧 正在执行工具：${parsed.tool_name}...`,
                  },
                  { role: "assistant" as const, content: "" },
                ];
                streamTargetIndexRef.current = next.length - 1;
                return next;
              });
              sawAssistantContent = false;
              sawAssistantError = false;
            } else {
              if (parsed.content) sawAssistantContent = true;
              if (parsed.error) sawAssistantError = true;
              appendAssistantChunk(parsed.content, parsed.error);
            }

            if (parsed.title) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentConvId ? { ...c, title: parsed.title } : c
                )
              );
            }
          },
        });
      }
      flushSseRemainder({
        onData: (parsed) => {
          if (parsed.type === "debug") {
            appendDebugEvent(currentConvId, parsed);
            return;
          }
          if (parsed.type === "tool_running") {
            flushStreamBuffer();
            setMessages((prev) => {
              const next = [
                ...prev,
                {
                  role: "tool" as const,
                  content: `🔧 正在执行工具：${parsed.tool_name}...`,
                },
                { role: "assistant" as const, content: "" },
              ];
              streamTargetIndexRef.current = next.length - 1;
              return next;
            });
            sawAssistantContent = false;
            sawAssistantError = false;
          } else {
            if (parsed.content) sawAssistantContent = true;
            if (parsed.error) sawAssistantError = true;
            appendAssistantChunk(parsed.content, parsed.error);
          }

          if (parsed.title) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === currentConvId ? { ...c, title: parsed.title } : c
              )
            );
          }
        },
      });
      flushPendingStreamSegmentsNow();
      flushStreamBuffer();
      if (!sawAssistantContent && !sawAssistantError) {
        replaceAssistantMessage(
          streamTargetIndexRef.current,
          "⚠️ 上游返回空内容，未生成可展示的回复。"
        );
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        if (debugEnabled && currentConvId) {
          appendDebugEvent(currentConvId, {
            timestamp: new Date().toISOString(),
            phase: "client_error",
            error: error.message || "发送失败，请检查网络和 API 配置",
          });
        }
        if (!sawAssistantError) {
          replaceAssistantMessage(
            streamTargetIndexRef.current,
            `❌ ${error.message || "发送失败，请检查网络和 API 配置"}`
          );
        }
        messageApi.error(error.message || "发送失败，请检查网络和 API 配置");
        console.error(error);
      }
    } finally {
      flushPendingStreamSegmentsNow();
      flushStreamBuffer();
      setLoading(false);
      abortControllerRef.current = null;
      streamTargetIndexRef.current = null;
      sseRemainderRef.current = "";
      refreshConversations();
      if (!controller.signal.aborted && currentConvId) {
        await syncConversationMessages(currentConvId);
      }
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleCopyMessage = (content: string) => {
    const displayContent = extractDisplayContent(content);
    navigator.clipboard.writeText(displayContent);
    messageApi.success("已复制到剪贴板");
  };

  const handleImageAdd = (file: File) => {
    const preview = URL.createObjectURL(file);
    setPendingImages((prev) => [...prev, { file, preview }]);
    return false; // 阻止 antd Upload 自动上传
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (imageFiles.length === 0) return;

    setPendingImages((prev) => [
      ...prev,
      ...imageFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
    messageApi.success(`已粘贴 ${imageFiles.length} 张图片`);
  };

  const handleImageRemove = (index: number) => {
    setPendingImages((prev) => {
      const target = prev[index];
      if (target?.preview) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const currentDebugEvents = currentConvId
    ? debugEventsByConversation[currentConvId] || []
    : [];
  const visibleMessages = messages.filter(
    (msg) =>
      !(
        msg.role === "assistant" &&
        !msg.content &&
        Array.isArray(msg.tool_calls) &&
        msg.tool_calls.length > 0
      )
  );

  const moduleNavContent = (
    <Sidebar
      moduleExpanded={moduleExpanded}
      setModuleExpanded={setModuleExpanded}
      themeMode={themeMode}
      resolvedTheme={resolvedTheme}
      setThemeMode={setThemeMode}
      activePath="/chat"
    />
  );

  const conversationListContent = (
    <div className={`conversation-panel ${isDark ? "dark" : ""}`}>
      <div className="conversation-panel-header">
        <div className="conversation-panel-title">
          <AppstoreOutlined />
          <span>对话列表</span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          onClick={handleCreateChat}
          title={"新对话 (Ctrl+N)"}
        >
          新建
        </Button>
      </div>

      <Input.Search
        placeholder="搜索对话..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        allowClear
        size="small"
        className="conversation-search"
      />

      <div className="conversation-scroll">
        {filteredConversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${
              currentConvId === conv.id ? "active" : ""
            }`}
            onClick={() => handleSelectConversation(conv.id)}
          >
            {editingTitleId === conv.id ? (
              <div className="title-edit" onClick={(e) => e.stopPropagation()}>
                <Input
                  size="small"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onPressEnter={handleRenameConfirm}
                  autoFocus
                />
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={handleRenameConfirm}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => setEditingTitleId(null)}
                />
              </div>
            ) : (
              <>
                <span className="conv-title">{conv.title}</span>
                <div className="conv-actions">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    className="action-btn"
                    onClick={(e) => handleRenameStart(conv, e)}
                  />
                  <Popconfirm
                    title="删除对话"
                    description="确定要删除这个对话吗？"
                    onConfirm={(e) =>
                      handleDeleteConversation(conv.id, e as any)
                    }
                    onCancel={(e) => (e as any)?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      className="action-btn delete-btn"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>
              </>
            )}
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="empty-conv">暂无对话记录</div>
        )}
      </div>
    </div>
  );

  const lastAssistantIdx = [...visibleMessages]
    .map((m) => m.role)
    .lastIndexOf("assistant");

  return (
    <ConfigProvider
      wave={{ disabled: true }}
      theme={{
        algorithm: isDark
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: {
          motion: false,
        },
      }}
    >
      {messageContextHolder}
      <div
        className={`chat-layout cw-dashboard-layout ${isDark ? "dark" : ""}`}
      >
        {!isMobile && moduleNavContent}

        {isMobile && (
          <>
            <Drawer
              placement="left"
              open={moduleDrawerVisible}
              onClose={() => setModuleDrawerVisible(false)}
              width={220}
              styles={{ body: { padding: 0 } }}
              title={null}
            >
              {moduleNavContent}
            </Drawer>
            <Drawer
              placement="right"
              open={conversationDrawerVisible}
              onClose={() => setConversationDrawerVisible(false)}
              width={320}
              styles={{ body: { padding: 0 } }}
              title={null}
            >
              {conversationListContent}
            </Drawer>
          </>
        )}

        <main className="chat-content" style={{ flex: 1, minWidth: 0 }}>
          <div className="chat-header">
            <div className="header-left">
              {isMobile && (
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  onClick={() => setModuleDrawerVisible(true)}
                />
              )}
              <span className="header-title">CW · 对话</span>
              {currentConvId && (
                <Tooltip
                  title={
                    currentSystemPrompt
                      ? "编辑 System Prompt（已激活）"
                      : "设置 System Prompt"
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setShowSystemPrompt(true)}
                    style={{
                      color: currentSystemPrompt ? "#f59e0b" : undefined,
                      fontWeight: currentSystemPrompt ? 600 : undefined,
                    }}
                  >
                    {currentSystemPrompt ? "System Prompt ✦" : "System Prompt"}
                  </Button>
                </Tooltip>
              )}
              {currentConvId && (
                <Tooltip title="查看本次对话的模型调试输出">
                  <Button
                    type="text"
                    size="small"
                    icon={<BugOutlined />}
                    onClick={() => setDebugDrawerVisible(true)}
                    style={{
                      color: debugEnabled ? "#ef4444" : undefined,
                      fontWeight: debugEnabled ? 600 : undefined,
                    }}
                  >
                    {debugEnabled ? "调试开启" : "开发者调试"}
                  </Button>
                </Tooltip>
              )}
            </div>
            <div className="header-right">
              {isMobile && (
                <Tooltip title="对话列表">
                  <Button
                    type="text"
                    icon={<AppstoreOutlined />}
                    onClick={() => setConversationDrawerVisible(true)}
                  />
                </Tooltip>
              )}
              <span className="header-username">{currentUser?.username}</span>
              <Avatar
                style={{ backgroundColor: "#2563eb" }}
                icon={<UserOutlined />}
              >
                {currentUser?.username?.[0]?.toUpperCase()}
              </Avatar>
            </div>
          </div>

          <div className="chat-main">
            <div className="chat-center">
              <div className="messages-area">
                {messages.length === 0 ? (
                  <div className="empty-messages">
                    <div className="empty-icon">✨</div>
                    <div className="empty-title">有什么我可以帮你的？</div>
                    <div className="empty-hint">按 Ctrl+N 创建新对话</div>
                  </div>
                ) : (
                  visibleMessages.map((msg, idx) => (
                    <div key={idx} className={`message-row ${msg.role}`}>
                      {msg.role === "assistant" && (
                        <Avatar
                          className="msg-avatar assistant-avatar"
                          size={32}
                        >
                          AI
                        </Avatar>
                      )}
                      {msg.role === "tool" && (
                        <Avatar className="msg-avatar tool-avatar" size={32}>
                          <ToolOutlined />
                        </Avatar>
                      )}
                      <div className={`message-bubble ${msg.role}`}>
                        {msg.role === "user" ? (
                          <div className="user-content">
                            {hasImage(msg.content) && (
                              <div className="image-preview-row">📷 图片</div>
                            )}
                            {editingMsgId === msg.id ? (
                              <div className="edit-message-container">
                                <Input.TextArea
                                  autoSize={{ minRows: 2, maxRows: 10 }}
                                  value={editingMsgContent}
                                  onChange={(e) =>
                                    setEditingMsgContent(e.target.value)
                                  }
                                  className="edit-message-input"
                                  disabled={loading}
                                />
                                <div
                                  className="edit-message-actions"
                                  style={{ marginTop: 8, textAlign: "right" }}
                                >
                                  <Button
                                    size="small"
                                    onClick={() => setEditingMsgId(null)}
                                    disabled={loading}
                                    style={{ marginRight: 8 }}
                                  >
                                    取消
                                  </Button>
                                  <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => handleSaveEdit(msg.id!)}
                                    loading={loading}
                                  >
                                    发送 / 重新生成
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              extractDisplayContent(msg.content)
                            )}
                          </div>
                        ) : msg.role === "tool" ? (
                          <div
                            className={`tool-message-card ${getToolMessageStatus(
                              msg
                            )}`}
                          >
                            <div className="tool-message-header">
                              <span className="tool-message-name">
                                {getToolMessageName(msg)}
                              </span>
                              <span className="tool-message-status">
                                {getToolMessageStatus(msg) === "running"
                                  ? "运行中"
                                  : getToolMessageStatus(msg) === "error"
                                  ? "失败"
                                  : "完成"}
                              </span>
                            </div>
                            <pre className="tool-message-body">
                              {extractDisplayContent(msg.content)}
                            </pre>
                          </div>
                        ) : (
                          <div
                            className={
                              loading && idx === lastAssistantIdx
                                ? "assistant-streaming"
                                : ""
                            }
                          >
                            {msg.content ? (
                              <div
                                className="stream-fade-shell"
                                data-streaming={
                                  loading && idx === lastAssistantIdx
                                }
                              >
                                <MarkdownRenderer
                                  content={msg.content}
                                  isDark={isDark}
                                  expandThinking={
                                    loading && idx === lastAssistantIdx
                                  }
                                />
                              </div>
                            ) : (
                              <>
                                {loading && idx === lastAssistantIdx ? (
                                  <div className="typing-placeholder">
                                    <span>AI 正在思考</span>
                                    <span className="typing-dots">
                                      <i />
                                      <i />
                                      <i />
                                    </span>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      color: "var(--text-tertiary)",
                                      fontSize: 14,
                                    }}
                                  >
                                    ⚠️
                                    这条回复未完成（可能因刷新或上游中断），请点击重新生成。
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className={`msg-actions ${msg.role}`}>
                        <Tooltip title="复制">
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => handleCopyMessage(msg.content)}
                            className="msg-action-btn"
                          />
                        </Tooltip>
                        {msg.role === "user" && msg.id && !loading && (
                          <Tooltip title="编辑">
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => {
                                setEditingMsgId(msg.id!);
                                setEditingMsgContent(
                                  extractDisplayContent(msg.content)
                                );
                              }}
                              className="msg-action-btn"
                            />
                          </Tooltip>
                        )}
                        {msg.role === "assistant" &&
                          idx === lastAssistantIdx &&
                          !loading && (
                            <Tooltip title="重新生成">
                              <Button
                                type="text"
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={handleRegenerate}
                                className="msg-action-btn"
                              />
                            </Tooltip>
                          )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="input-area">
                {pendingImages.length > 0 && (
                  <div className="pending-images">
                    {pendingImages.map((img, i) => (
                      <div key={i} className="pending-image-item">
                        <img src={img.preview} alt="upload" />
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<CloseOutlined />}
                          className="remove-image-btn"
                          onClick={() => handleImageRemove(i)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="input-container">
                  <Tooltip title="上传图片">
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={handleImageAdd}
                      multiple
                    >
                      <Button
                        type="text"
                        icon={<PictureOutlined />}
                        className="input-action-btn"
                        disabled={loading}
                      />
                    </Upload>
                  </Tooltip>

                  <TextArea
                    ref={inputRef as any}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onPaste={handleInputPaste}
                    onPressEnter={(e) => {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="问问 CW… (Shift+Enter 换行 / Enter 发送)"
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    variant="borderless"
                    disabled={loading}
                    className="chat-input chat-input-textarea"
                  />

                  {loading ? (
                    <Tooltip title="停止生成">
                      <Button
                        danger
                        shape="circle"
                        icon={<StopOutlined />}
                        onClick={handleStop}
                        className="send-btn"
                      />
                    </Tooltip>
                  ) : (
                    <Button
                      type="primary"
                      shape="circle"
                      icon={<SendOutlined />}
                      disabled={!inputText.trim() && pendingImages.length === 0}
                      onClick={sendMessage}
                      className="send-btn"
                    />
                  )}
                </div>
                <div className="input-hint">
                  CW 是一款 AI 工具，其回答未必正确无误。Shift+Enter 换行
                </div>
              </div>
            </div>

            {!isMobile && conversationListContent}
          </div>
        </main>

        <SystemPromptModal
          open={showSystemPrompt}
          onClose={() => setShowSystemPrompt(false)}
          conversationId={currentConvId}
          currentPrompt={currentSystemPrompt}
          currentContextWindow={currentContextWindow}
          onSave={handleSaveSystemPrompt}
        />
        <Drawer
          title="开发者调试"
          placement="right"
          width={520}
          open={debugDrawerVisible}
          onClose={() => setDebugDrawerVisible(false)}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>采集模型交互流</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  开启后会记录本页后续请求的原始调试事件、上游 chunk、工具调用和错误。
                </div>
              </div>
              <Switch checked={debugEnabled} onChange={setDebugEnabled} />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                当前对话已记录 {currentDebugEvents.length} 条调试事件
              </div>
              <Button
                size="small"
                onClick={() => {
                  if (!currentConvId) return;
                  setDebugEventsByConversation((prev) => ({
                    ...prev,
                    [currentConvId]: [],
                  }));
                }}
                disabled={!currentConvId || currentDebugEvents.length === 0}
              >
                清空
              </Button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {currentDebugEvents.length === 0 ? (
                <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                  暂无调试事件。开启开关后重新发送、重试或编辑消息即可看到完整流。
                </div>
              ) : (
                currentDebugEvents.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      border: "1px solid var(--border-light)",
                      borderRadius: 12,
                      padding: 12,
                      background: "var(--card-bg, transparent)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 8,
                        fontSize: 12,
                      }}
                    >
                      <strong>{event.phase || event.type || "debug"}</strong>
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {event.timestamp
                          ? new Date(event.timestamp).toLocaleTimeString()
                          : "-"}
                      </span>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {JSON.stringify(event, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </Drawer>
      </div>
    </ConfigProvider>
  );
};

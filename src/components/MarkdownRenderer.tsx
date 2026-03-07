import {
  CheckOutlined,
  CodeOutlined,
  CopyOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

interface MarkdownRendererProps {
  content: string;
  isDark?: boolean;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toThinkDetails = (rawBody: string) => {
  const body = String(rawBody || "").trim();
  if (!body) return "";
  return `<details class="think-block"><summary>思考过程</summary><pre>${escapeHtml(
    body
  )}</pre></details>`;
};

const normalizeThinkingBlocks = (rawContent: string) => {
  if (!rawContent) return rawContent;

  let normalized = rawContent;

  normalized = normalized.replace(
    /```(?:think|thinking|reasoning|analysis)\s*([\s\S]*?)```/gi,
    (_, body) => `<think>\n${body}\n</think>`
  );
  normalized = normalized.replace(
    /<(thinking|reasoning|analysis)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (_, _tag, body) => `<think>\n${body}\n</think>`
  );
  normalized = normalized.replace(
    /\[(?:think|thinking|reasoning|analysis)\]([\s\S]*?)\[\/(?:think|thinking|reasoning|analysis)\]/gi,
    (_, body) => `<think>\n${body}\n</think>`
  );
  normalized = normalized.replace(
    /<think(?:\s[^>]*)?>([\s\S]*?)<\/think>/gi,
    (_, body) => toThinkDetails(body)
  );

  return normalized;
};

function CodeBlock({
  language,
  children,
  isDark,
}: {
  language: string;
  children: string;
  isDark: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isHtml = language?.toLowerCase() === "html";

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang">{language || "text"}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {isHtml && (
            <Tooltip title={preview ? "查看代码" : "实时预览"}>
              <Button
                type="text"
                size="small"
                icon={preview ? <CodeOutlined /> : <EyeOutlined />}
                onClick={() => setPreview(!preview)}
                className="copy-btn"
              />
            </Tooltip>
          )}
          <Tooltip title={copied ? "已复制！" : "复制代码"}>
            <Button
              type="text"
              size="small"
              icon={
                copied ? (
                  <CheckOutlined style={{ color: "#52c41a" }} />
                ) : (
                  <CopyOutlined />
                )
              }
              onClick={handleCopy}
              className="copy-btn"
            />
          </Tooltip>
        </div>
      </div>
      {preview && isHtml ? (
        <div
          style={{
            background: "#fff",
            borderRadius: "0 0 8px 8px",
            padding: "8px",
            height: "350px",
            overflow: "hidden",
          }}
        >
          <iframe
            srcDoc={children}
            style={{ width: "100%", height: "100%", border: "none" }}
            title="Artifact Preview"
            sandbox="allow-scripts"
          />
        </div>
      ) : (
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={language || "text"}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: "0 0 8px 8px",
            fontSize: "13px",
            lineHeight: "1.6",
          }}
        >
          {children}
        </SyntaxHighlighter>
      )}
    </div>
  );
}

export const MarkdownRenderer = ({
  content,
  isDark = false,
}: MarkdownRendererProps) => {
  const normalizedContent = useMemo(
    () => normalizeThinkingBlocks(content),
    [content]
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath] as any[]}
      rehypePlugins={[rehypeKatex, rehypeRaw] as any[]}
      className="md-content"
      components={{
        code(props: any) {
          const { children, className, node, ...rest } = props;
          const match = /language-(\w+)/.exec(className || "");
          const isBlock =
            node?.position?.start?.line !== node?.position?.end?.line ||
            String(children).includes("\n");

          if (match || isBlock) {
            return (
              <CodeBlock language={match?.[1] || ""} isDark={isDark}>
                {String(children).replace(/\n$/, "")}
              </CodeBlock>
            );
          }
          return (
            <code {...rest} className="inline-code">
              {children}
            </code>
          );
        },
        table({ children }) {
          return (
            <div className="table-wrapper">
              <table>{children}</table>
            </div>
          );
        },
        a({ children, href }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {normalizedContent}
    </ReactMarkdown>
  );
};

import { Sidebar } from "@/components/Sidebar";
import { useShellPreferences } from "@/hooks/useShellPreferences";
import {
  ApiOutlined,
  MessageOutlined,
  ReloadOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/useAppStore";
import { request } from "@/services/request";
import {
  Avatar,
  Button,
  Card,
  Col,
  ConfigProvider,
  Empty,
  Progress,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  theme as antdTheme,
} from "antd";
import { useEffect, useState } from "react";
import "./index.css";

type SystemOverviewData = {
  runtime: {
    node: string;
    platform: string;
    uptime_seconds: number;
  };
  counts: {
    tasks: number;
    skills: number;
    channels: number;
    channels_enabled: number;
    cron_jobs: number;
    mcp_servers: number;
    mcp_enabled: number;
  };
  health?: {
    commands?: Array<{
      name: string;
      installed: boolean;
      version?: string;
      error?: string;
    }>;
    network?: Array<{
      target: string;
      reachable: boolean;
      status?: number;
      error?: string;
    }>;
  };
  context_budget?: {
    context_window: number;
    compact_threshold: number;
    compact_threshold_ratio: number;
    static_tokens: number;
    static_percentage: number;
    remaining_budget: number;
    remaining_percentage: number;
    active_model?: {
      model_id: string;
      display_name: string;
    } | null;
    breakdown: Array<{
      key: string;
      label: string;
      tokens: number;
      percentage_of_window: number;
    }>;
  };
  recommendations: string[];
};

export default () => {
  const { currentUser, isLoggedIn } = useAppStore();
  const navigate = useNavigate();
  const {
    moduleExpanded,
    setModuleExpanded,
    themeMode,
    resolvedTheme,
    setThemeMode,
    isDark,
  } = useShellPreferences();
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overview, setOverview] = useState<SystemOverviewData | null>(null);

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const data = await request<SystemOverviewData>("/api/system/overview");
      setOverview(data);
    } catch (error) {
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    loadOverview();
  }, [isLoggedIn]);

  if (!isLoggedIn) return null;

  const counts = overview?.counts;
  const runtime = overview?.runtime;
  const commandChecks = overview?.health?.commands || [];
  const networkChecks = overview?.health?.network || [];
  const contextBudget = overview?.context_budget;
  const segmentColors: Record<string, string> = {
    global_prompt: "#2563eb",
    skills: "#f59e0b",
    mcp_tools: "#06b6d4",
  };

  return (
    <ConfigProvider
      wave={{ disabled: true }}
      theme={{
        algorithm: isDark
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: { motion: false },
      }}
    >
      <div className={`cw-dashboard-layout ${isDark ? "dark" : ""}`}>
        <Sidebar
          moduleExpanded={moduleExpanded}
          setModuleExpanded={setModuleExpanded}
          themeMode={themeMode}
          resolvedTheme={resolvedTheme}
          setThemeMode={setThemeMode}
          activePath="/dashboard"
        />

        <main className="cw-dashboard-main-wrap">
          <section className="cw-dashboard-hero">
            <div>
              <div className="cw-dashboard-eyebrow">Dashboard</div>
              <h1>欢迎回来，{currentUser?.username || "CW 用户"}</h1>
              <p>
                workhorse 是你的个人助理 Agent 工作台，当前聚合了对话、工具、
                任务与调度能力。
              </p>
            </div>
            <div className="cw-user-card">
              <Avatar size={48} style={{ backgroundColor: "#2563eb" }}>
                {currentUser?.username?.[0]?.toUpperCase()}
              </Avatar>
              <div>
                <div className="cw-user-name">{currentUser?.username}</div>
                <div className="cw-user-desc">当前本地账号</div>
              </div>
            </div>
          </section>

          <section className="cw-dashboard-main">
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Card className="cw-module-card">
                  <div className="cw-usage-header">
                    <div>
                      <h3>系统概览</h3>
                      <p>当前本地工作台运行状态</p>
                    </div>
                    <div className="cw-usage-actions">
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={loadOverview}
                        loading={overviewLoading}
                      />
                    </div>
                  </div>
                  {overviewLoading ? (
                    <div className="cw-usage-loading">
                      <Spin size="small" />
                    </div>
                  ) : !counts ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂无系统数据"
                    />
                  ) : (
                    <>
                      <div className="cw-usage-grid">
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">任务数</div>
                          <div className="cw-usage-value">
                            {counts.tasks?.toLocaleString() ?? "0"}
                          </div>
                        </div>
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">技能数</div>
                          <div className="cw-usage-value">
                            {counts.skills?.toLocaleString() ?? "0"}
                          </div>
                        </div>
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">MCP 服务</div>
                          <div className="cw-usage-value">
                            {counts.mcp_servers ?? 0}
                          </div>
                        </div>
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">Cron 任务</div>
                          <div className="cw-usage-value">
                            {counts.cron_jobs ?? 0}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 16,
                          color: isDark ? "#cbd5e1" : "#475569",
                        }}
                      >
                        <div>
                          运行环境：Node {runtime?.node || "-"} /{" "}
                          {runtime?.platform || "-"}
                        </div>
                        <div>
                          已运行：
                          {runtime
                            ? `${Math.floor(runtime.uptime_seconds / 60)} 分钟`
                            : "-"}
                        </div>
                        {(overview?.recommendations || []).length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            {(overview?.recommendations || []).map((item) => (
                              <div key={item}>{item}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={10}>
                <Card className="cw-module-card">
                  <div className="cw-usage-header">
                    <div>
                      <h3>健康检查</h3>
                      <p>关键命令、软件安装与外网连通性</p>
                    </div>
                  </div>
                  {overviewLoading && !overview ? (
                    <div className="cw-usage-loading">
                      <Spin size="small" />
                    </div>
                  ) : (
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <div>
                        <Typography.Text strong>本地命令</Typography.Text>
                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          {commandChecks.map((item) => (
                            <div
                              key={item.name}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div>{item.name}</div>
                                <Typography.Text type="secondary">
                                  {item.installed
                                    ? item.version || "已安装"
                                    : item.error || "未安装"}
                                </Typography.Text>
                              </div>
                              <Tag color={item.installed ? "success" : "error"}>
                                {item.installed ? "正常" : "缺失"}
                              </Tag>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Typography.Text strong>网络连通性</Typography.Text>
                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          {networkChecks.map((item) => (
                            <div
                              key={item.target}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div>{item.target}</div>
                                <Typography.Text type="secondary">
                                  {item.reachable
                                    ? `HTTP ${item.status || 200}`
                                    : item.error || "不可达"}
                                </Typography.Text>
                              </div>
                              <Tag color={item.reachable ? "success" : "warning"}>
                                {item.reachable ? "可达" : "异常"}
                              </Tag>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Space>
                  )}
                </Card>
              </Col>

              <Col xs={24}>
                <Card className="cw-module-card">
                  <div className="cw-usage-header">
                    <div>
                      <h3>上下文预算</h3>
                      <p>默认上下文窗口 256k；达到 70% 后 Agent 会先压缩历史上下文</p>
                    </div>
                    {contextBudget?.active_model ? (
                      <Tag color="blue">
                        {contextBudget.active_model.display_name ||
                          contextBudget.active_model.model_id}
                      </Tag>
                    ) : null}
                  </div>
                  {!contextBudget ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂无上下文预算数据"
                    />
                  ) : (
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <div className="cw-usage-grid">
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">上下文窗口</div>
                          <div className="cw-usage-value">
                            {Math.round(contextBudget.context_window / 1024)}k
                          </div>
                        </div>
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">压缩阈值</div>
                          <div className="cw-usage-value">
                            {Math.round(contextBudget.compact_threshold / 1024)}k
                          </div>
                        </div>
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">静态占用</div>
                          <div className="cw-usage-value">
                            {contextBudget.static_percentage}%
                          </div>
                        </div>
                        <div className="cw-usage-item">
                          <div className="cw-usage-label">剩余运行预算</div>
                          <div className="cw-usage-value">
                            {contextBudget.remaining_percentage}%
                          </div>
                        </div>
                      </div>

                      <Progress
                        percent={Math.min(100, contextBudget.static_percentage)}
                        strokeColor="#2563eb"
                        trailColor={isDark ? "#1e293b" : "#e2e8f0"}
                        format={(percent) => `静态上下文 ${percent}%`}
                      />

                      <div
                        style={{
                          display: "grid",
                          gap: 12,
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                        }}
                      >
                        {contextBudget.breakdown.map((item) => (
                          <Card
                            key={item.key}
                            size="small"
                            style={{
                              background: isDark
                                ? "rgba(15, 23, 42, 0.42)"
                                : "#f8fafc",
                            }}
                          >
                            <Space
                              direction="vertical"
                              size={8}
                              style={{ width: "100%" }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                }}
                              >
                                <Typography.Text strong>{item.label}</Typography.Text>
                                <Tag color="default">{item.tokens} tokens</Tag>
                              </div>
                              <Progress
                                percent={Math.min(100, item.percentage_of_window)}
                                strokeColor={segmentColors[item.key] || "#64748b"}
                                trailColor={isDark ? "#1e293b" : "#e2e8f0"}
                                format={(percent) => `${percent}%`}
                              />
                            </Space>
                          </Card>
                        ))}
                      </div>
                    </Space>
                  )}
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  className="cw-module-card"
                  hoverable
                  onClick={() => navigate("/chat")}
                >
                  <MessageOutlined className="cw-module-icon" />
                  <h3>对话</h3>
                  <p>多模型流式对话、会话管理和 System Prompt 配置入口。</p>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  className="cw-module-card"
                  hoverable
                  onClick={() => navigate("/mcp")}
                >
                  <ApiOutlined className="cw-module-icon" />
                  <h3>MCP 管理</h3>
                  <p>查看已接入的工具服务，并继续扩展 Agent 能力边界。</p>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  className="cw-module-card"
                  hoverable
                  onClick={() => navigate("/cron-jobs")}
                >
                  <ScheduleOutlined className="cw-module-icon" />
                  <h3>调度中心</h3>
                  <p>把任务变成周期执行的自动化工作流，并跟踪运行状态。</p>
                </Card>
              </Col>
            </Row>
          </section>
        </main>
      </div>
    </ConfigProvider>
  );
};

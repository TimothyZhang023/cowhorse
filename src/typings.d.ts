declare namespace API {
  type CurrentUser = {
    uid?: string;
    username: string;
    role?: string;
    id?: number;
  };

  type LoginParams = {
    username: string;
    password: string;
  };

  type LoginResult = {
    token: string;
    user: CurrentUser;
    error?: string;
  };

  type Conversation = {
    id: string;
    title: string;
    system_prompt?: string;
    created_at?: string;
  };

  type Message = {
    id?: number;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
  };

  type Endpoint = {
    id: number;
    name: string;
    provider?: "openai_compatible" | "openai" | "gemini" | "openrouter";
    base_url: string;
    api_key?: string;
    api_key_preview?: string;
    is_default: boolean;
    use_preset_models: boolean;
    created_at?: string;
    updated_at?: string;
  };

  type Model = {
    id?: number;
    model_id: string;
    display_name: string;
  };

  type McpServer = {
    id: number;
    name: string;
    type: string;
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    auth?: {
      type: "bearer" | "basic";
      token?: string;
      username?: string;
      password?: string;
    };
    is_enabled: number;
    created_at?: string;
  };

  type Skill = {
    id: number;
    name: string;
    description?: string;
    prompt: string;
    examples?: any[];
    tools?: string[];
    created_at?: string;
    updated_at?: string;
  };

  type AgentTask = {
    id: number;
    name: string;
    description?: string;
    system_prompt: string;
    skill_ids: number[];
    tool_names: string[];
    is_active: number;
    created_at?: string;
    updated_at?: string;
  };

  type TaskRun = {
    id: number;
    uid?: string;
    task_id: number;
    task_name?: string;
    cron_job_id?: number | null;
    cron_job_name?: string | null;
    conversation_id?: string | number | null;
    conversation_title?: string | null;
    trigger_source: "manual" | "cron";
    status: "running" | "success" | "failed";
    initial_message?: string;
    final_response?: string;
    error_message?: string;
    started_at?: string;
    finished_at?: string;
    created_at?: string;
  };

  type TaskRunEvent = {
    id: number;
    run_id: number;
    uid?: string;
    event_type: string;
    title: string;
    content?: string;
    metadata?: Record<string, any> | null;
    created_at?: string;
  };

  type CronJob = {
    id: number;
    task_id: number;
    name: string;
    cron_expression: string;
    next_run?: string;
    last_run?: string;
    last_status?: string;
    is_enabled: number;
  };
}

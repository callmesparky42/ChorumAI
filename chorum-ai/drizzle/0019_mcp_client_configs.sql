-- Migration: Add mcp_server_configs table for external MCP client connections
-- Allows users to configure external MCP servers (like Brave Search, Tavily)
-- that the chat interface can use for tool calling

CREATE TABLE IF NOT EXISTS "mcp_server_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" text NOT NULL,
  "transport_type" text NOT NULL,
  "command" text,
  "args" jsonb,
  "env" jsonb,
  "url" text,
  "headers" jsonb,
  "is_enabled" boolean DEFAULT true,
  "cached_tools" jsonb,
  "last_tool_refresh" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Enable RLS
ALTER TABLE "mcp_server_configs" ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own MCP server configs
CREATE POLICY "mcp_server_configs_user_policy" ON "mcp_server_configs"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

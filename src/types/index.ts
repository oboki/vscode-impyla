/**
 * Shared type definitions for Impyla extension
 */

export interface ImpylaConfig {
  connection: ConnectionConfig;
  jinja?: JinjaConfig;
  extension?: ExtensionConfig;
}

export interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  auth_mechanism: "PLAIN" | "NOSASL" | "LDAP" | "KERBEROS";
  user?: string;
  password?: string;
  timeout?: number;
  use_ssl?: boolean;
  ca_cert?: string | null;
}

export interface JinjaConfig {
  plugin_paths?: string[];
  variables?: Record<string, any>;
}

export interface ExtensionConfig {
  max_rows?: number;
  python_path?: string;
  auto_preview?: boolean;
}

export interface JinjaRenderRequest {
  template: string;
  variables: Record<string, any>;
  plugin_paths: string[];
  base_dir: string;
}

export interface JinjaRenderResponse {
  success: boolean;
  rendered?: string;
  loaded_plugins?: string[];
  error?: string;
  error_type?: string;
  line?: number;
}

export interface QueryExecutionRequest {
  connection: ConnectionConfig;
  sql: string;
  max_rows: number;
}

export interface QueryExecutionResponse {
  success: boolean;
  columns?: string[];
  rows?: any[][];
  row_count?: number;
  execution_time_ms?: number;
  has_more?: boolean;
  error?: string;
  error_type?: "ConnectionError" | "SQLSyntaxError" | "ImpalaError";
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  executionTimeMs: number;
  hasMore: boolean;
  renderedSql?: string;
}

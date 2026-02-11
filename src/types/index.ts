export interface ImpalaConfig {
  connection: {
    host: string;
    port: number;
    database: string;
    auth_mechanism: 'PLAIN' | 'NOSASL' | 'LDAP' | 'KERBEROS';
    user: string;
    password: string;
    timeout?: number;
    use_ssl?: boolean;
  };
  jinja?: {
    plugin_paths?: string[];
    variables?: Record<string, any>;
  };
  extension?: {
    max_rows?: number;
    python_path?: string;
  };
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  columns?: string[];
  rowCount?: number;
  executionTime?: number;
  error?: string;
  renderedSql?: string;
}

export interface JinjaRenderResult {
  success: boolean;
  rendered?: string;
  error?: string;
}

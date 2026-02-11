#!/usr/bin/env python3
"""
Execute Impala queries using the impyla library
"""

import json
import sys
import time
from typing import Dict, Any


def execute_query(config: Dict[str, Any]) -> Dict[str, Any]:
    """Execute an Impala query and return results"""
    try:
        from impala.dbapi import connect
        from impala.error import Error as ImpalaError
    except ImportError as e:
        return {
            "success": False,
            "error": f"Failed to import impyla: {str(e)}. Please install: pip install impyla",
            "error_type": "ConnectionError",
        }

    connection_config = config["connection"]
    sql = config["sql"]
    max_rows = config.get("max_rows", 10000)

    conn = None
    cursor = None

    try:
        # Connect to Impala
        start_time = time.time()

        conn_params = {
            "host": connection_config["host"],
            "port": connection_config["port"],
            "database": connection_config.get("database", "default"),
            "timeout": connection_config.get("timeout", 300),
            "auth_mechanism": connection_config.get("auth_mechanism", "NOSASL"),
        }

        # Add authentication parameters if provided
        if connection_config.get("user"):
            conn_params["user"] = connection_config["user"]
        if connection_config.get("password"):
            conn_params["password"] = connection_config["password"]
        if connection_config.get("use_ssl"):
            conn_params["use_ssl"] = connection_config["use_ssl"]
        if connection_config.get("ca_cert"):
            conn_params["ca_cert"] = connection_config["ca_cert"]

        # Establish connection
        conn = connect(**conn_params)
        cursor = conn.cursor()

        # Execute query
        cursor.execute(sql)

        # Fetch results
        columns = [desc[0] for desc in cursor.description] if cursor.description else []

        rows = []
        row_count = 0
        has_more = False

        if cursor.description:  # Query returns results
            for row in cursor.fetchmany(max_rows):
                rows.append(list(row))
                row_count += 1

                if row_count >= max_rows:
                    # Check if there are more rows
                    try:
                        next_row = cursor.fetchone()
                        if next_row:
                            has_more = True
                    except:
                        pass
                    break

        execution_time_ms = int((time.time() - start_time) * 1000)

        return {
            "success": True,
            "columns": columns,
            "rows": rows,
            "row_count": row_count,
            "execution_time_ms": execution_time_ms,
            "has_more": has_more,
        }

    except ImpalaError as e:
        error_msg = str(e)
        error_type = "ImpalaError"

        # Classify error type
        if "connect" in error_msg.lower() or "connection" in error_msg.lower():
            error_type = "ConnectionError"
        elif (
            "syntax" in error_msg.lower()
            or "parse" in error_msg.lower()
            or "analysis" in error_msg.lower()
        ):
            error_type = "SQLSyntaxError"

        return {"success": False, "error": error_msg, "error_type": error_type}

    except Exception as e:
        return {"success": False, "error": str(e), "error_type": "ImpalaError"}

    finally:
        # Clean up
        if cursor:
            try:
                cursor.close()
            except:
                pass
        if conn:
            try:
                conn.close()
            except:
                pass


def main():
    """Main entry point"""
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        config = json.loads(input_data)

        # Execute query
        result = execute_query(config)

        # Write result to stdout
        print(json.dumps(result))
        sys.exit(0)

    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "error": f"Invalid JSON input: {str(e)}",
            "error_type": "ImpalaError",
        }
        print(json.dumps(error_result))
        sys.exit(1)

    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "error_type": "ImpalaError",
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()

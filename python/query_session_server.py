#!/usr/bin/env python3
"""
Persistent Impala query session server.

Protocol: newline-delimited JSON over stdin/stdout.
Each request must include an integer "id" and an "action".
"""

import json
import math
import sys
import time
import uuid
from datetime import date, datetime, time as datetime_time
from decimal import Decimal
from typing import Any, Dict, Optional


def to_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, bool)):
        return value

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if isinstance(value, Decimal):
        number = float(value)
        return number if math.isfinite(number) else None

    if isinstance(value, (datetime, date, datetime_time)):
        return value.isoformat()

    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")

    if isinstance(value, dict):
        return {str(key): to_json_safe(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [to_json_safe(item) for item in value]

    return str(value)


def looks_like_auth_failure(message: str) -> bool:
    normalized = message.lower()
    patterns = [
        "authentication failed",
        "invalid credentials",
        "bad credentials",
        "login failed",
        "error validating the login",
        "password is incorrect",
    ]
    return any(pattern in normalized for pattern in patterns)


class SessionStore:
    def __init__(self) -> None:
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def close_session(self, session_id: str) -> None:
        session = self.sessions.pop(session_id, None)
        if not session:
            return

        cursor = session.get("cursor")
        conn = session.get("conn")
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    def close_all(self) -> None:
        for session_id in list(self.sessions.keys()):
            self.close_session(session_id)

    def cleanup_idle(self) -> None:
        now = time.time()
        expired = []
        for session_id, session in self.sessions.items():
            idle_timeout = session.get("idle_timeout_seconds", 120)
            last_access = session.get("last_access", now)
            if now - last_access > idle_timeout:
                expired.append(session_id)

        for session_id in expired:
            self.close_session(session_id)


def success_response(request_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    result = {"id": request_id, "success": True}
    result.update(payload)
    return result


def error_response(
    request_id: int,
    message: str,
    error_type: str = "ImpalaError",
) -> Dict[str, Any]:
    return {
        "id": request_id,
        "success": False,
        "error": message,
        "error_type": error_type,
        "is_auth_failure": looks_like_auth_failure(message),
    }


def classify_error_type(error_message: str) -> str:
    normalized = error_message.lower()
    if "connect" in normalized or "connection" in normalized:
        return "ConnectionError"
    if "syntax" in normalized or "parse" in normalized or "analysis" in normalized:
        return "SQLSyntaxError"
    return "ImpalaError"


def handle_execute(
    request_id: int,
    request: Dict[str, Any],
    store: SessionStore,
) -> Dict[str, Any]:
    try:
        from impala.dbapi import connect
        from impala.error import Error as ImpalaError
    except ImportError as error:
        return error_response(
            request_id,
            f"Failed to import impyla: {str(error)}. Please install: pip install impyla",
            "ConnectionError",
        )

    connection_config = request.get("connection")
    sql = str(request.get("sql", ""))
    if not connection_config or not sql.strip():
        return error_response(request_id, "Missing connection or SQL in request")

    page_size = request.get("page_size")
    idle_timeout_seconds = int(request.get("idle_timeout_seconds", 120))

    try:
        page_size = int(page_size) if page_size is not None else 100
    except Exception:
        page_size = 100

    if page_size <= 0:
        page_size = 100

    conn = None
    cursor = None
    start_time = time.time()

    try:
        conn_params = {
            "host": connection_config["host"],
            "port": connection_config["port"],
            "database": connection_config.get("database", "default"),
            "timeout": connection_config.get("timeout", 300),
            "auth_mechanism": connection_config.get("auth_mechanism", "NOSASL"),
        }

        if connection_config.get("user"):
            conn_params["user"] = connection_config["user"]
        if connection_config.get("password"):
            conn_params["password"] = connection_config["password"]
        if connection_config.get("use_ssl"):
            conn_params["use_ssl"] = connection_config["use_ssl"]
        if connection_config.get("ca_cert"):
            conn_params["ca_cert"] = connection_config["ca_cert"]

        server_info = {
            "host": connection_config["host"],
            "port": connection_config["port"],
            "database": connection_config.get("database", "default"),
            "auth_mechanism": connection_config.get("auth_mechanism", "NOSASL"),
            "use_ssl": bool(connection_config.get("use_ssl", False)),
            "idle_timeout_seconds": max(10, idle_timeout_seconds),
        }

        conn = connect(**conn_params)
        cursor = conn.cursor()
        cursor.execute(sql)

        columns = [desc[0] for desc in cursor.description] if cursor.description else []

        if not cursor.description:
            execution_time_ms = int((time.time() - start_time) * 1000)
            try:
                cursor.close()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass
            return success_response(
                request_id,
                {
                    "columns": [],
                    "rows": [],
                    "row_count": 0,
                    "execution_time_ms": execution_time_ms,
                    "has_more": False,
                    "session_id": None,
                    "server_info": server_info,
                },
            )

        fetched_rows = cursor.fetchmany(page_size + 1)
        has_more = len(fetched_rows) > page_size
        if has_more:
            fetched_rows = fetched_rows[:page_size]

        rows = [[to_json_safe(cell) for cell in row] for row in fetched_rows]
        execution_time_ms = int((time.time() - start_time) * 1000)

        session_id: Optional[str] = None
        if has_more:
            session_id = str(uuid.uuid4())
            store.sessions[session_id] = {
                "conn": conn,
                "cursor": cursor,
                "columns": columns,
                "server_info": server_info,
                "last_access": time.time(),
                "idle_timeout_seconds": max(10, idle_timeout_seconds),
            }
        else:
            try:
                cursor.close()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass

        return success_response(
            request_id,
            {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "execution_time_ms": execution_time_ms,
                "has_more": has_more,
                "session_id": session_id,
                "server_info": server_info,
            },
        )

    except Exception as error:
        message = str(error)
        error_type = classify_error_type(message)

        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass

        return error_response(request_id, message, error_type)


def handle_fetch(
    request_id: int,
    request: Dict[str, Any],
    store: SessionStore,
) -> Dict[str, Any]:
    session_id = request.get("session_id")
    if not session_id:
        return error_response(request_id, "session_id is required", "ConnectionError")

    session = store.sessions.get(str(session_id))
    if not session:
        return error_response(
            request_id,
            "Session expired or not found. Re-run the query.",
            "ConnectionError",
        )

    page_size = request.get("page_size", 100)
    try:
        page_size = int(page_size)
    except Exception:
        page_size = 100

    if page_size <= 0:
        page_size = 100

    cursor = session.get("cursor")
    if not cursor:
        store.close_session(str(session_id))
        return error_response(
            request_id,
            "Session cursor is unavailable. Re-run the query.",
            "ConnectionError",
        )

    start_time = time.time()

    try:
        fetched_rows = cursor.fetchmany(page_size + 1)
        has_more = len(fetched_rows) > page_size
        if has_more:
            fetched_rows = fetched_rows[:page_size]

        rows = [[to_json_safe(cell) for cell in row] for row in fetched_rows]
        execution_time_ms = int((time.time() - start_time) * 1000)

        if has_more:
            session["last_access"] = time.time()
        else:
            store.close_session(str(session_id))

        return success_response(
            request_id,
            {
                "columns": session.get("columns", []),
                "rows": rows,
                "row_count": len(rows),
                "execution_time_ms": execution_time_ms,
                "has_more": has_more,
                "session_id": str(session_id) if has_more else None,
                "server_info": session.get("server_info"),
            },
        )
    except Exception as error:
        store.close_session(str(session_id))
        return error_response(request_id, str(error), classify_error_type(str(error)))


def main() -> int:
    store = SessionStore()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = int(request.get("id", -1))
        except Exception as error:
            print(
                json.dumps(
                    {
                        "id": -1,
                        "success": False,
                        "error": f"Invalid JSON input: {str(error)}",
                        "error_type": "ImpalaError",
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            continue

        try:
            store.cleanup_idle()
            action = request.get("action")
            if action == "execute":
                response = handle_execute(request_id, request, store)
            elif action == "fetch":
                response = handle_fetch(request_id, request, store)
            elif action == "close":
                session_id = request.get("session_id")
                if session_id:
                    store.close_session(str(session_id))
                response = success_response(
                    request_id,
                    {
                        "columns": [],
                        "rows": [],
                        "row_count": 0,
                        "execution_time_ms": 0,
                        "has_more": False,
                        "session_id": None,
                    },
                )
            elif action == "close_all":
                store.close_all()
                response = success_response(
                    request_id,
                    {
                        "columns": [],
                        "rows": [],
                        "row_count": 0,
                        "execution_time_ms": 0,
                        "has_more": False,
                        "session_id": None,
                    },
                )
            else:
                response = error_response(
                    request_id,
                    f"Unsupported action: {action}",
                    "ImpalaError",
                )
        except Exception as error:
            response = error_response(request_id, str(error), classify_error_type(str(error)))

        print(json.dumps(response, ensure_ascii=False), flush=True)

    store.close_all()
    return 0


if __name__ == "__main__":
    sys.exit(main())

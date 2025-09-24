from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from . import settings

try:  # pragma: no cover - optional dependency
    from databricks import sql as dbsql
except Exception:  # pragma: no cover - optional dependency
    dbsql = None


_TABLE_COLUMNS: set[str] = set()


def require_dbsql() -> None:
    if not dbsql:
        raise RuntimeError(
            "databricks-sql-connector is not installed. Run: pip install databricks-sql-connector"
        )
    if not (
        settings.DATABRICKS_HOST
        and settings.DATABRICKS_TOKEN
        and settings.DATABRICKS_HTTP_PATH
    ):
        raise RuntimeError(
            "Missing Databricks env vars. Set DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID"
        )


@contextmanager
def db_cursor() -> Iterator["dbsql.Cursor"]:
    require_dbsql()
    conn = dbsql.connect(
        server_hostname=settings.DATABRICKS_HOST.replace("https://", "").replace("http://", ""),
        http_path=settings.DATABRICKS_HTTP_PATH,
        access_token=settings.DATABRICKS_TOKEN,
    )
    try:
        cur = conn.cursor()
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
    finally:
        conn.close()


def ensure_feedback_tables(refresh: bool = False) -> None:
    global _TABLE_COLUMNS
    if not dbsql or not settings.CHAT_FEEDBACK_TABLE:
        return
    if _TABLE_COLUMNS and not refresh:
        return
    try:
        with db_cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {settings.CHAT_FEEDBACK_TABLE} (
                    message_id STRING,
                    prompt STRING,
                    normalized_prompt STRING,
                    tokens ARRAY<STRING>,
                    answer STRING,
                    dataset STRING,
                    plan_json STRING,
                    table_json STRING,
                    chart_json STRING,
                    sql STRING,
                    latency_ms DOUBLE,
                    status STRING,
                    rating STRING,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    source_message_id STRING,
                    match_score DOUBLE
                )
                USING DELTA
                TBLPROPERTIES (delta.autoOptimize.optimizeWrite = true, delta.autoOptimize.autoCompact = true)
                """
            )
            try:
                cur.execute(
                    f"ALTER TABLE {settings.CHAT_FEEDBACK_TABLE} ADD COLUMNS (followups ARRAY<STRING>)"
                )
            except Exception:
                pass
            try:
                cur.execute(f"SHOW COLUMNS IN {settings.CHAT_FEEDBACK_TABLE}")
                cols = cur.fetchall()
                column_names = {str(row[0]).lower() for row in cols}
            except Exception:
                column_names = set()
        if column_names:
            _TABLE_COLUMNS = column_names
    except Exception as exc:  # pragma: no cover - logging
        settings.logger.error("Failed to ensure feedback tables exist: %s", exc)


def feedback_table_has(column: str) -> bool:
    return column.lower() in _TABLE_COLUMNS


__all__ = [
    "db_cursor",
    "ensure_feedback_tables",
    "feedback_table_has",
    "require_dbsql",
    "dbsql",
]

"""Bounded SQL pool and migration adoption of the unchanged Flyway SQL history."""
import hashlib
import re
import zlib
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def open_pool(settings):
    pool = ConnectionPool(settings.database_url, kwargs={"user": settings.db_user, "password": settings.db_password,
                          "row_factory": dict_row, "connect_timeout": 5, "options": "-c statement_timeout=30000 -c lock_timeout=10000"},
                          min_size=1, max_size=10, timeout=10, open=False)
    pool.open(wait=True, timeout=30)
    return pool


def migrate(pool):
    root = Path(__file__).resolve().parents[1] / "migrations/legacy"
    if not root.exists():
        root = Path("/app/migrations")
    if len(list(root.glob("V*__*.sql"))) != 8:
        raise RuntimeError("Required database migration history is missing; refusing to start.")
    with pool.connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(811723911)")
        conn.execute('''CREATE TABLE IF NOT EXISTS flyway_schema_history (
            installed_rank integer NOT NULL PRIMARY KEY, version varchar(50), description varchar(200) NOT NULL,
            type varchar(20) NOT NULL, script varchar(1000) NOT NULL, checksum integer,
            installed_by varchar(100) NOT NULL, installed_on timestamp NOT NULL DEFAULT now(),
            execution_time integer NOT NULL, success boolean NOT NULL)''')
        for path in sorted(root.glob("V*__*.sql"), key=lambda p: int(p.name.split("__")[0][1:])):
            raw = path.read_text(encoding="utf-8-sig")
            # Flyway CRC32 joins UTF-8 lines without line endings.
            checksum = zlib.crc32("".join(raw.splitlines()).encode())
            if checksum >= 2**31:
                checksum -= 2**32
            version, description = path.stem[1:].split("__", 1)
            old = conn.execute("SELECT checksum,success FROM flyway_schema_history WHERE version=%s", (version,)).fetchone()
            if old:
                if not old["success"] or old["checksum"] != checksum:
                    raise RuntimeError(f"Migration history mismatch for version {version}; refusing to modify data.")
                continue
            conn.execute(raw, prepare=False)
            conn.execute('''INSERT INTO flyway_schema_history(installed_rank,version,description,type,script,checksum,installed_by,execution_time,success)
                SELECT coalesce(max(installed_rank),0)+1,%s,%s,'SQL',%s,%s,current_user,0,true FROM flyway_schema_history''',
                         (version, description.replace("_", " "), path.name, checksum))
        # Python-only extensions use their own immutable, checksummed history.
        conn.execute("CREATE TABLE IF NOT EXISTS pios_python_migrations(version text PRIMARY KEY,checksum text NOT NULL)")
        extensions = Path("/app/python-migrations")
        if not extensions.exists():
            extensions = Path(__file__).resolve().parents[1] / "migrations"
        for path in sorted(extensions.glob("P*.sql")):
            raw = path.read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            old = conn.execute("SELECT checksum FROM pios_python_migrations WHERE version=%s", (path.name,)).fetchone()
            if old and old["checksum"] != digest:
                raise RuntimeError("Python migration checksum mismatch")
            if not old:
                conn.execute(raw.decode(), prepare=False)
                conn.execute("INSERT INTO pios_python_migrations VALUES (%s,%s)", (path.name, digest))


def camel(name):
    return re.sub(r"_([a-z])", lambda m: m[1].upper(), name)


def view(row, aliases=None):
    return {((aliases or {}).get(k, camel(k))): v for k, v in row.items()}

import base64
import os
from pathlib import Path
from urllib.parse import urlsplit


def setting(name: str, default: str = "") -> str:
    # Docker secrets support both the existing hosted names and environment files.
    aliases = {"DB_PASSWORD": "spring.datasource.password", "APP_JWT_SECRET_BASE64": "app.jwt.secret-base64",
               "PIOS_ENCRYPTION_KEY": "app.encryption.key-base64"}
    path = Path(os.getenv(name + "_FILE", "/run/secrets/" + aliases.get(name, name)))
    return path.read_text().strip() if path.is_file() else os.getenv(name, default)


class Settings:
    def __init__(self):
        self.database_url = setting("DATABASE_URL", setting("DB_URL", "postgresql://localhost:5432/pios")).removeprefix("jdbc:")
        self.db_user = setting("DB_USERNAME", "pios")
        self.db_password = setting("DB_PASSWORD")
        self.secret = base64.b64decode(setting("APP_JWT_SECRET_BASE64"), validate=True)
        self.encryption_key = base64.b64decode(setting("PIOS_ENCRYPTION_KEY"), validate=True)
        if len(self.secret) < 32 or len(self.encryption_key) != 32:
            raise ValueError("Configure the existing JWT secret (32+ bytes) and encryption key (32 bytes).")
        self.hosted = setting("PIOS_ENV", setting("SPRING_PROFILES_ACTIVE")) == "hosted"
        self.origins = setting("PIOS_PUBLIC_ORIGIN", setting("APP_CORS_ALLOWED_ORIGINS", "http://localhost:3100")).split(",")
        self.secure_cookie = self.hosted or setting("APP_SESSION_COOKIE_SECURE", "false").lower() == "true"
        self.local_models = setting("PIOS_ALLOW_LOCAL_MODELS", "false").lower() == "true"
        if self.hosted:
            origin = urlsplit(self.origins[0])
            if len(self.origins) != 1 or origin.scheme != "https" or not origin.hostname or origin.username or origin.path not in ("", "/") or origin.query or origin.fragment or self.local_models:
                raise ValueError("Hosted mode requires one HTTPS origin and disabled local models.")
        self.cloud_hosts = set(setting("PIOS_ALLOWED_CLOUD_HOSTS", "api.openai.com,openrouter.ai,api.groq.com,api.deepseek.com,api.mistral.ai").split(","))
        self.storage = Path(setting("PIOS_STORAGE_PATH", "./data/uploads")).resolve()
        self.upload_limit = int(setting("PIOS_MAX_UPLOAD_BYTES", "26214400"))
        self.worker = setting("PIOS_RAG_WORKER_ENABLED", "true").lower() == "true"
        self.worker_delay = max(0.1, int(setting("PIOS_RAG_WORKER_DELAY_MS", "3000")) / 1000)

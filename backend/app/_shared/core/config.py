from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "DFX Wholesale"
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite+aiosqlite:///./wholesale_dev.db"
    # Used by Alembic only; falls back to DATABASE_URL when empty.
    DIRECT_URL: str = ""

    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_TIMEOUT: int = 30

    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    # One sign-in lasts a working day.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    # Photos and the business logo are saved here and served at /uploads.
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 5

    # Email for sending bills. Leave SMTP_HOST empty to switch email off.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_TLS: bool = True
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    def validate_production_safety(self) -> None:
        if self.ENVIRONMENT == "production" and (self.SECRET_KEY == "change-me" or len(self.SECRET_KEY) < 32):
            raise RuntimeError("SECRET_KEY must be set to at least 32 random characters in production.")


def to_async_url(url: str) -> str:
    """The app runs on async drivers. Hosts (Render, Heroku...) hand out plain
    postgres:// / postgresql:// URLs, so add the asyncpg driver here."""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("sqlite://"):
        url = url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    return url


settings = Settings()

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    mongo_url: str
    mongo_db: str = "nextalent_cv"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    frontend_origin: str = "http://localhost:3000"
    langflow_webhook_url: str = ""
    langflow_api_key: str = ""
    langflow_timeout_seconds: int = 600
    langflow_test_mode: bool = True
    max_cv_size_mb: int = 5
    upload_dir: str = "/app/uploads"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()

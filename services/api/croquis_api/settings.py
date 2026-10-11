"""Configuración por variables de entorno (ver .env.example). Nunca secretos en el repo."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    anthropic_api_key: str = Field(default="", description="Llave de la API de Claude")
    croquis_llm_model: str = Field(default="claude-sonnet-5-5")
    croquis_llm_daily_budget_usd: float = Field(default=2.0, ge=0)
    croquis_llm_rate_limit_per_hour: int = Field(default=20, ge=0)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key) and self.croquis_llm_daily_budget_usd > 0


def get_settings() -> Settings:
    return Settings()

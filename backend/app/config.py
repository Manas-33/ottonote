from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env wins over inherited shell env — otherwise an empty exported var (e.g.
# ANTHROPIC_API_KEY= in ~/.zshrc) silently masks the value we wrote in .env.
load_dotenv(override=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    hf_token: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"
    whisper_model: str = "base"
    whisper_compute_type: str = "int8"

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    database_url: str = ""

    dev_mode: bool = False

    @property
    def async_database_url(self) -> str:
        """SQLAlchemy expects postgresql+asyncpg:// for async, regardless of what's in .env."""
        url = self.database_url
        if url.startswith("postgresql+asyncpg://"):
            return url
        if url.startswith("postgresql://"):
            return "postgresql+asyncpg://" + url[len("postgresql://"):]
        return url


settings = Settings()

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


settings = Settings()

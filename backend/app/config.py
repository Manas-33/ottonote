from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    hf_token: str = ""
    anthropic_api_key: str = ""
    whisper_model: str = "base"
    whisper_compute_type: str = "int8"


settings = Settings()

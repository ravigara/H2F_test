from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    ollama_timeout: int = 120
    max_context_messages: int = 10
    default_response_language: str = "auto"

    # ASR settings
    whisper_model_size: str = "base"
    enable_indic_asr: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
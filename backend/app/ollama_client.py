import httpx
import json

from .config import settings
from .logger import get_logger

log = get_logger("ollama")

MAX_RETRIES = 2


class OllamaClient:
    """Async client for Ollama LLM API with error handling and retries."""

    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        self.timeout = settings.ollama_timeout

    async def stream(self, messages: list):
        """Stream LLM response chunks.

        Yields text chunks. On failure, yields an error message string
        prefixed with '[ERROR]' instead of crashing.
        """
        last_error = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(self.timeout, connect=10.0)
                ) as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/api/chat",
                        json={"model": self.model, "messages": messages},
                    ) as response:
                        response.raise_for_status()

                        async for line in response.aiter_lines():
                            if line:
                                try:
                                    data = json.loads(line)
                                    content = data.get("message", {}).get("content", "")
                                    if content:
                                        yield content
                                except json.JSONDecodeError:
                                    log.warning(f"Invalid JSON from Ollama: {line[:100]}")
                                    continue

                        # Successful completion — exit retry loop
                        return

            except httpx.ConnectError as e:
                last_error = e
                log.error(
                    f"Cannot connect to Ollama at {self.base_url} "
                    f"(attempt {attempt}/{MAX_RETRIES}): {e}"
                )
            except httpx.HTTPStatusError as e:
                last_error = e
                log.error(
                    f"Ollama HTTP error {e.response.status_code} "
                    f"(attempt {attempt}/{MAX_RETRIES}): {e}"
                )
            except httpx.TimeoutException as e:
                last_error = e
                log.error(
                    f"Ollama request timed out after {self.timeout}s "
                    f"(attempt {attempt}/{MAX_RETRIES}): {e}"
                )
            except Exception as e:
                last_error = e
                log.error(f"Unexpected Ollama error (attempt {attempt}/{MAX_RETRIES}): {e}")

        # All retries failed
        error_msg = f"[ERROR] LLM unavailable after {MAX_RETRIES} attempts: {last_error}"
        log.error(error_msg)
        yield error_msg

    async def is_available(self) -> bool:
        """Check if Ollama is reachable."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False
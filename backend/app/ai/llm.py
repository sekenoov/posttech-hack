"""Configurable LLM layer for AI Jana.

LLM_PROVIDER=openrouter (primary) | anthropic (optional) | none.
Keys come from env only and never leave the backend. Any provider failure
raises LLMError and the assistant degrades to retrieval-only answers.
"""
import logging
from typing import Protocol

import httpx

from app.config import settings

logger = logging.getLogger("janamen.ai")

DEFAULT_MODELS = {
    "openrouter": "anthropic/claude-opus-5.5",
    "anthropic": "claude-opus-5-5",
}
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(Exception):
    """Provider unavailable, misconfigured, refused or returned nothing usable."""


class LLMProvider(Protocol):
    name: str
    model: str

    def complete(self, system: str, user: str) -> str: ...


class OpenRouterProvider:
    name = "openrouter"

    def __init__(self, api_key: str, model: str, timeout: float):
        self.api_key, self.model, self.timeout = api_key, model, timeout

    def complete(self, system: str, user: str) -> str:
        try:
            response = httpx.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "HTTP-Referer": "http://localhost",
                    "X-Title": "JanaMen",
                },
                json={
                    "model": self.model,
                    "temperature": 0,
                    "max_tokens": 800,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMError(f"openrouter: {type(exc).__name__}") from exc
        if not content or not content.strip():
            raise LLMError("openrouter: empty response")
        return content.strip()


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float):
        import anthropic  # optional dependency path; imported only when selected

        self._anthropic = anthropic
        self.model = model
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=1)

    def complete(self, system: str, user: str) -> str:
        a = self._anthropic
        try:
            # Short grounded answers: low effort. Server-side fallback reroutes a
            # policy decline to another model instead of failing the turn.
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=2000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except a.APIConnectionError as exc:
            raise LLMError("anthropic: connection error") from exc
        except a.RateLimitError as exc:
            raise LLMError("anthropic: rate limited") from exc
        except a.APIStatusError as exc:
            raise LLMError(f"anthropic: HTTP {exc.status_code}") from exc
        if response.stop_reason == "refusal":
            raise LLMError("anthropic: refusal")
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        if not text:
            raise LLMError("anthropic: empty response")
        return text


def get_provider() -> LLMProvider | None:
    """The configured provider, or None for retrieval-only mode."""
    provider = (settings.llm_provider or "none").lower()
    model = settings.llm_model or DEFAULT_MODELS.get(provider, "")
    timeout = settings.llm_timeout_seconds
    if provider == "openrouter" and settings.openrouter_api_key:
        return OpenRouterProvider(settings.openrouter_api_key, model, timeout)
    if provider == "anthropic" and settings.anthropic_api_key:
        try:
            return AnthropicProvider(settings.anthropic_api_key, model, timeout)
        except Exception:  # SDK missing or misconfigured: stay available in retrieval-only mode
            logger.exception("Anthropic provider could not be initialised")
            return None
    return None

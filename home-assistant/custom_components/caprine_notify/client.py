"""Client for the Caprine local notification endpoint."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import aiohttp


class CaprineNotifyError(Exception):
    """Raised when Caprine cannot be reached or rejects a notification."""


@dataclass(frozen=True)
class CaprineNotifyClient:
    """Small HTTP client for Caprine's local notification receiver."""

    session: aiohttp.ClientSession
    host: str
    port: int
    token: str | None = None

    @property
    def base_url(self) -> str:
        """Return the Caprine notification receiver base URL."""
        return f"http://{self.host}:{self.port}"

    async def async_health_check(self) -> None:
        """Check that Caprine's notification receiver answers."""
        try:
            async with asyncio.timeout(5):
                response = await self.session.get(
                    f"{self.base_url}/health",
                    headers=self._headers,
                )
                if response.status != 200:
                    raise CaprineNotifyError(
                        f"Caprine health check returned HTTP {response.status}"
                    )
        except (TimeoutError, aiohttp.ClientError) as error:
            raise CaprineNotifyError("Could not reach Caprine") from error

    async def async_send(
        self,
        *,
        title: str,
        message: str,
        icon: str | None = None,
        url: str | None = None,
        persistent: bool = False,
        timeout_ms: int | bool | None = None,
        silent: bool | None = None,
        notification_id: str | None = None,
    ) -> None:
        """Send one notification to Caprine."""
        payload: dict[str, Any] = {
            "title": title,
            "message": message,
            "persistent": persistent,
        }

        if icon:
            payload["icon"] = icon

        if url:
            payload["url"] = url

        if timeout_ms is not None:
            payload["timeoutMs"] = timeout_ms

        if silent is not None:
            payload["silent"] = silent

        if notification_id:
            payload["id"] = notification_id

        try:
            async with asyncio.timeout(8):
                response = await self.session.post(
                    f"{self.base_url}/notify",
                    headers=self._headers,
                    json=payload,
                )
                if response.status >= 400:
                    body = await response.text()
                    raise CaprineNotifyError(
                        f"Caprine notify returned HTTP {response.status}: {body}"
                    )
        except (TimeoutError, aiohttp.ClientError) as error:
            raise CaprineNotifyError("Could not send notification to Caprine") from error

    @property
    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        return headers

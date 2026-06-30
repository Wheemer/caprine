"""Notify platform for Caprine Notify."""

from __future__ import annotations

from typing import Any

from homeassistant.components.notify import NotifyEntity, NotifyEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .client import CaprineNotifyClient, CaprineNotifyError
from .const import DATA_CLIENTS, DOMAIN


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Caprine notify entity from a config entry."""
    client = hass.data[DOMAIN][DATA_CLIENTS][entry.entry_id]
    async_add_entities([CaprineNotifyEntity(entry, client)])


class CaprineNotifyEntity(NotifyEntity):
    """Home Assistant notify entity backed by Caprine's local receiver."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_supported_features = NotifyEntityFeature.TITLE

    def __init__(self, entry: ConfigEntry, client: CaprineNotifyClient) -> None:
        """Initialize the entity."""
        self._entry = entry
        self._client = client
        self._attr_unique_id = f"{entry.unique_id}-notify"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.unique_id or entry.entry_id)},
            "name": entry.data.get(CONF_NAME, entry.title),
            "manufacturer": "Wheemer",
            "model": "Caprine",
        }

    async def async_send_message(self, message: str, title: str | None = None, **kwargs: Any) -> None:
        """Send a notification message."""
        data = kwargs.get("data") or {}
        try:
            await self._client.async_send(
                title=title or "Home Assistant",
                message=message,
                icon=data.get("icon"),
                url=data.get("url"),
                persistent=bool(data.get("persistent", False)),
                timeout_ms=data.get("timeoutMs") or data.get("timeout_ms"),
                silent=data.get("silent"),
                notification_id=data.get("id"),
            )
        except CaprineNotifyError as error:
            raise RuntimeError(str(error)) from error

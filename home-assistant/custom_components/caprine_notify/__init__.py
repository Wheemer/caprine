"""Caprine Notify integration."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_NAME, CONF_PORT, CONF_TOKEN
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv

from .client import CaprineNotifyClient, CaprineNotifyError
from .const import (
    ATTR_TARGETS,
    CONF_ICON,
    CONF_PERSISTENT,
    CONF_TIMEOUT,
    CONF_URL,
    DATA_CLIENTS,
    DATA_SERVICE_REGISTERED,
    DEFAULT_PERSISTENT,
    DEFAULT_TIMEOUT,
    DOMAIN,
    PLATFORMS,
    SERVICE_SEND_NOTIFICATION,
)

_LOGGER = logging.getLogger(__name__)

SEND_NOTIFICATION_SCHEMA = vol.Schema(
    {
        vol.Required("message"): cv.string,
        vol.Optional("title", default="Home Assistant"): cv.string,
        vol.Optional(CONF_URL): cv.string,
        vol.Optional(CONF_ICON): cv.string,
        vol.Optional(CONF_PERSISTENT): cv.boolean,
        vol.Optional(CONF_TIMEOUT): vol.All(vol.Coerce(int), vol.Range(min=1, max=3600)),
        vol.Optional("silent"): cv.boolean,
        vol.Optional("id"): cv.string,
        vol.Optional(ATTR_TARGETS): vol.All(cv.ensure_list, [cv.string]),
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Caprine Notify from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault(DATA_CLIENTS, {})

    client = CaprineNotifyClient(
        session=async_get_clientsession(hass),
        host=entry.data[CONF_HOST],
        port=entry.data[CONF_PORT],
        token=entry.data.get(CONF_TOKEN) or None,
    )

    hass.data[DOMAIN][DATA_CLIENTS][entry.entry_id] = client

    if not hass.data[DOMAIN].get(DATA_SERVICE_REGISTERED):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SEND_NOTIFICATION,
            _build_send_service_handler(hass),
            schema=SEND_NOTIFICATION_SCHEMA,
        )
        hass.data[DOMAIN][DATA_SERVICE_REGISTERED] = True

    if PLATFORMS:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Caprine Notify config entry."""
    unload_ok = (
        await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
        if PLATFORMS
        else True
    )
    if unload_ok:
        hass.data[DOMAIN][DATA_CLIENTS].pop(entry.entry_id, None)

    if unload_ok and not hass.data[DOMAIN][DATA_CLIENTS]:
        hass.services.async_remove(DOMAIN, SERVICE_SEND_NOTIFICATION)
        hass.data[DOMAIN][DATA_SERVICE_REGISTERED] = False

    return unload_ok


def _build_send_service_handler(hass: HomeAssistant):
    async def _async_send_notification(call: ServiceCall) -> None:
        clients = _matching_clients(hass, call.data.get(ATTR_TARGETS))
        if not clients:
            raise ServiceValidationError("No matching Caprine Notify targets found")

        title = call.data["title"]
        message = call.data["message"]
        icon = call.data.get(CONF_ICON)
        url = call.data.get(CONF_URL)
        persistent = call.data.get(CONF_PERSISTENT, DEFAULT_PERSISTENT)
        timeout = call.data.get(CONF_TIMEOUT, DEFAULT_TIMEOUT)
        silent = call.data.get("silent")
        notification_id = call.data.get("id")

        timeout_ms: int | bool | None
        timeout_ms = False if persistent else timeout * 1000

        errors: list[Exception] = []
        for _entry, client in clients:
            try:
                await client.async_send(
                    title=title,
                    message=message,
                    icon=icon,
                    url=url,
                    persistent=persistent,
                    timeout_ms=timeout_ms,
                    silent=silent,
                    notification_id=notification_id,
                )
            except CaprineNotifyError as error:
                errors.append(error)
                _LOGGER.warning("Failed to send Caprine notification: %s", error)

        if errors:
            raise HomeAssistantError(str(errors[0]))

    return _async_send_notification


def _matching_clients(
    hass: HomeAssistant, targets: list[str] | None
) -> list[tuple[ConfigEntry, CaprineNotifyClient]]:
    clients: dict[str, CaprineNotifyClient] = hass.data[DOMAIN][DATA_CLIENTS]
    entries = {
        entry.entry_id: entry
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.entry_id in clients
    }

    if not targets:
        return [(entries[entry_id], client) for entry_id, client in clients.items()]

    normalized_targets = {target.casefold() for target in targets}
    matched: list[tuple[ConfigEntry, CaprineNotifyClient]] = []
    for entry_id, client in clients.items():
        entry = entries[entry_id]
        names = {
            entry.title.casefold(),
            str(entry.data.get(CONF_NAME, "")).casefold(),
            entry_id.casefold(),
        }
        if names & normalized_targets:
            matched.append((entry, client))

    return matched

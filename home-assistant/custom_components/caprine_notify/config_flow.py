"""Config flow for Caprine Notify."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_HOST, CONF_NAME, CONF_PORT, CONF_TOKEN
from homeassistant.components import zeroconf
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv

from .client import CaprineNotifyClient, CaprineNotifyError
from .const import DEFAULT_NAME, DEFAULT_PORT, DOMAIN


class CaprineNotifyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Caprine Notify."""

    VERSION = 1

    async def async_step_zeroconf(
        self, discovery_info: zeroconf.ZeroconfServiceInfo
    ) -> config_entries.ConfigFlowResult:
        """Handle a Caprine zeroconf discovery."""
        properties = discovery_info.properties
        host = discovery_info.host
        port = discovery_info.port
        name = str(properties.get("name") or discovery_info.name.split(".")[0])
        unique_id = str(properties.get("id") or f"{host}:{port}")

        await self.async_set_unique_id(unique_id)
        self._abort_if_unique_id_configured(updates={CONF_HOST: host, CONF_PORT: port})

        self.context["title_placeholders"] = {"name": name}

        return self.async_create_entry(
            title=name,
            data={
                CONF_NAME: name,
                CONF_HOST: host,
                CONF_PORT: port,
                CONF_TOKEN: "",
            },
        )

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST].strip()
            port = user_input[CONF_PORT]
            name = user_input[CONF_NAME].strip()
            token = user_input.get(CONF_TOKEN, "").strip()

            await self.async_set_unique_id(f"caprine-{host}:{port}")
            self._abort_if_unique_id_configured()

            client = CaprineNotifyClient(
                session=async_get_clientsession(self.hass),
                host=host,
                port=port,
                token=token or None,
            )

            try:
                await client.async_health_check()
            except CaprineNotifyError:
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title=name,
                    data={
                        CONF_NAME: name,
                        CONF_HOST: host,
                        CONF_PORT: port,
                        CONF_TOKEN: token,
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_NAME, default=DEFAULT_NAME): cv.string,
                    vol.Required(CONF_HOST, default="garagepc"): cv.string,
                    vol.Required(CONF_PORT, default=DEFAULT_PORT): vol.All(
                        vol.Coerce(int), vol.Range(min=1, max=65535)
                    ),
                    vol.Optional(CONF_TOKEN): cv.string,
                }
            ),
            errors=errors,
        )

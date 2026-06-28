"""Constants for Caprine Notify."""

from __future__ import annotations

from homeassistant.const import CONF_HOST, CONF_NAME, CONF_PORT, CONF_TOKEN

DOMAIN = "caprine_notify"
PLATFORMS: list[str] = []

CONF_ICON = "icon"
CONF_PERSISTENT = "persistent"
CONF_TIMEOUT = "timeout"
CONF_URL = "url"

DEFAULT_NAME = "GaragePC Caprine"
DEFAULT_PORT = 32174
DEFAULT_TIMEOUT = 7
DEFAULT_PERSISTENT = False

ATTR_TARGETS = "targets"

DATA_CLIENTS = "clients"
DATA_SERVICE_REGISTERED = "service_registered"

SERVICE_SEND_NOTIFICATION = "send_notification"

CONF_KEYS = {
    CONF_HOST,
    CONF_NAME,
    CONF_PORT,
    CONF_TOKEN,
    CONF_ICON,
    CONF_PERSISTENT,
    CONF_TIMEOUT,
}

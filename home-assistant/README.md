# Caprine Notify for Home Assistant

This custom integration adds Caprine as a local Home Assistant notification target.

It creates `caprine_notify.send_notification`, a Caprine-specific action with support for persistent notifications, timeout, URL, and icon fields.

Example rich action:

```yaml
action: caprine_notify.send_notification
data:
  title: Doorbell
  message: Someone is at the door.
  url: http://192.168.1.40:8123/local/tmp/doorbell_noification.jpg
  persistent: true
```

The Caprine app must be running on the target PC and listening on its local notification port, currently `32174`.

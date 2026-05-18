# homebridge-bticino-classe300x

A Homebridge plugin to open the door of a **BTicino Classe 100X / 300X** intercom directly from Apple HomeKit, via SSH.

This plugin exposes:
- A **garage door** in HomeKit that automatically closes after a configurable delay (default 5 seconds), simulating a momentary door button press
- An optional **contact sensor** watchdog that monitors SSH connectivity to the intercom and triggers an alert in HomeKit if the intercom becomes unreachable

> **Important:** This plugin requires the custom firmware developed by [@fquinto](https://github.com/fquinto/bticinoClasse300x) to be installed on your intercom. The firmware enables SSH access and exposes the OpenWebNet socket used to send door commands.

---

## Requirements

- Homebridge >= 1.3.0
- Node.js >= 14.0.0
- BTicino Classe 100X or 300X with custom firmware installed: [fquinto/bticinoClasse300x](https://github.com/fquinto/bticinoClasse300x)
- SSH access enabled on the intercom (enabled by the custom firmware)

---

## Installation

```bash
npm install -g homebridge-bticino-classe300x
```

Or install via the Homebridge UI by searching for `homebridge-bticino-classe300x`.

---

## Configuration

Add the following to your Homebridge `config.json` under `accessories`:

```json
{
  "accessories": [
    {
      "accessory": "BticinoDoorOpener",
      "name": "Front Door",
      "host": "192.168.1.37",
      "username": "root2",
      "password": "pwned123",
      "sshPort": 22,
      "resetDelay": 5,
      "watchdog": true,
      "watchdogInterval": 10
    }
  ]
}
```

### Configuration Parameters

| Parameter         | Required | Default | Description                                                         |
|-------------------|----------|---------|---------------------------------------------------------------------|
| `accessory`       | ✅ Yes   | -       | Must be `BticinoDoorOpener`                                         |
| `name`            | ✅ Yes   | -       | Name shown in HomeKit                                               |
| `host`            | ✅ Yes   | -       | IP address of the intercom                                          |
| `username`        | No       | `root2` | SSH username (set during firmware preparation)                      |
| `password`        | No       | `pwned123` | SSH password (set during firmware preparation)                   |
| `sshPort`         | No       | `22`    | SSH port                                                            |
| `resetDelay`      | No       | `5`     | Seconds before the door resets to CLOSED after being triggered      |
| `watchdog`        | No       | `true`  | Set to `false` to disable the watchdog contact sensor               |
| `watchdogInterval`| No       | `10`    | How often (in minutes) the watchdog checks SSH connectivity         |

---

## How It Works

### Door Opening

When you tap the garage door in HomeKit:

1. The plugin connects to the intercom via SSH
2. It sends the OpenWebNet door open command via `nc` (netcat):
   ```
   echo '*8*19*20##' | nc -w 2 0 30006
   sleep 1
   echo '*8*20*20##' | nc -w 2 0 30006
   ```
3. HomeKit shows the door as OPEN
4. After `resetDelay` seconds, the door automatically resets to CLOSED

If the SSH connection fails, the door immediately resets to CLOSED and an error is logged in Homebridge.

### Watchdog

When enabled, the plugin attempts an SSH connection to the intercom every `watchdogInterval` minutes:
- If SSH succeeds → contact sensor stays **closed** (normal)
- If SSH fails → contact sensor goes **open** → HomeKit triggers an alert ("Intercom Not Working")

This is especially useful because the dropbear SSH daemon on the custom firmware can occasionally be killed by internal BTicino processes. You can use this sensor to trigger a HomeKit automation (e.g. a notification on your phone).

---

## Troubleshooting

**SSH connection refused / timeout**
- Make sure the intercom is reachable on the network (`ping <host>`)
- Verify dropbear (SSH daemon) is running on the intercom
- If SSH stops working after a few days, install the watchdog script on the intercom itself — see the [fquinto repository issues](https://github.com/fquinto/bticinoClasse300x/issues)

**Door does not open**
- Verify the OpenWebNet command works manually:
  ```bash
  ssh root2@<intercom_ip> "echo '*8*19*20##' | nc -w 2 0 30006; sleep 1; echo '*8*20*20##' | nc -w 2 0 30006"
  ```

---

## Credits

- Custom firmware for BTicino Classe 100X/300X: [@fquinto/bticinoClasse300x](https://github.com/fquinto/bticinoClasse300x)
- OpenWebNet door commands documented in the fquinto repository

---

## License

MIT

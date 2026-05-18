# homebridge-bticinoClasse300x

A Homebridge plugin to open the door of a **BTicino Classe 100X / 300X** intercom directly from Apple HomeKit, via SSH.

This plugin exposes a **switch** in HomeKit that automatically resets to OFF after a configurable delay (default 5 seconds), simulating a momentary door button press.

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
npm install -g homebridge-bticinoClasse300x
```

Or install via the Homebridge UI by searching for `homebridge-bticinoClasse300x`.

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
      "resetDelay": 5
    }
  ]
}
```

### Configuration Parameters

| Parameter    | Required | Default    | Description                                                   |
|--------------|----------|------------|---------------------------------------------------------------|
| `accessory`  | ✅ Yes   | -          | Must be `BticinoDoorOpener`                                   |
| `name`       | ✅ Yes   | -          | Name shown in HomeKit                                         |
| `host`       | ✅ Yes   | -          | IP address of the intercom                                    |
| `username`   | No       | `root2`    | SSH username (set during firmware preparation)                |
| `password`   | No       | `pwned123` | SSH password (set during firmware preparation)                |
| `sshPort`    | No       | `22`       | SSH port                                                      |
| `resetDelay` | No       | `5`        | Seconds before the switch resets to OFF after being triggered |

---

## How It Works

When you tap the switch in HomeKit:

1. The plugin connects to the intercom via SSH
2. It sends the OpenWebNet door open command via `nc` (netcat):
   ```
   echo '*8*19*20##' | nc -w 2 0 30006
   sleep 1
   echo '*8*20*20##' | nc -w 2 0 30006
   ```
3. The door opens
4. After `resetDelay` seconds, the switch automatically resets to OFF

If the SSH connection fails, the switch immediately resets to OFF and an error is logged in Homebridge.

---

## Troubleshooting

**SSH connection refused / timeout**
- Make sure the intercom is reachable on the network (`ping <host>`)
- Verify dropbear (SSH daemon) is running on the intercom
- If SSH stops working after a few days, check the [dropbear watchdog solution](https://github.com/fquinto/bticinoClasse300x/issues) documented in the fquinto repository

**Door does not open**
- Verify the OpenWebNet command works manually from your machine:
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

'use strict';

const { Client } = require('ssh2');

const PLUGIN_NAME = 'homebridge-bticinoClasse300x';
const PLATFORM_NAME = 'BticinoDoorOpener';

module.exports = (api) => {
  api.registerAccessory(PLUGIN_NAME, PLATFORM_NAME, BticinoDoorOpener);
};

class BticinoDoorOpener {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    this.name = config.name || 'BTicino Door';
    this.host = config.host;
    this.username = config.username || 'root2';
    this.password = config.password || 'pwned123';
    this.port = config.sshPort || 22;
    this.resetDelay = (config.resetDelay || 5) * 1000;

    this.switchOn = false;

    if (!this.host) {
      this.log.error('Missing required config: host');
      return;
    }

    this.informationService = new this.api.hap.Service.AccessoryInformation()
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'BTicino')
      .setCharacteristic(this.api.hap.Characteristic.Model, 'Classe 100X/300X')
      .setCharacteristic(this.api.hap.Characteristic.SerialNumber, this.host);

    this.switchService = new this.api.hap.Service.Switch(this.name);

    this.switchService
      .getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(this.handleGet.bind(this))
      .onSet(this.handleSet.bind(this));

    this.log.info(`BTicino Door Opener initialized for ${this.host}`);
  }

  handleGet() {
    return this.switchOn;
  }

  handleSet(value, callback) {
    if (!value) {
      this.switchOn = false;
      if (typeof callback === 'function') callback(null);
      return;
    }

    this.log.info('Opening door...');
    this.switchOn = true;

    this._openDoor()
      .then(() => {
        this.log.info('Door open command sent successfully ✅');
        if (typeof callback === 'function') callback(null);
      })
      .catch((err) => {
        this.log.error('Failed to open door ❌:', err.message);
        this.switchOn = false;
        this.switchService
          .getCharacteristic(this.api.hap.Characteristic.On)
          .updateValue(false);
        if (typeof callback === 'function') callback(err);
      })
      .finally(() => {
        setTimeout(() => {
          this.switchOn = false;
          this.switchService
            .getCharacteristic(this.api.hap.Characteristic.On)
            .updateValue(false);
          this.log.info(`Switch reset to OFF after ${this.resetDelay / 1000}s`);
        }, this.resetDelay);
      });
  }

  _openDoor() {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('SSH connection timeout'));
      }, 10000);

      conn.on('ready', () => {
        this.log.debug('SSH connection established');

        const cmd = "echo '*8*19*20##' | nc -w 2 0 30006; sleep 1; echo '*8*20*20##' | nc -w 2 0 30006";

        conn.exec(cmd, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            return reject(err);
          }

          let output = '';
          let errorOutput = '';

          stream.on('data', (data) => { output += data.toString(); });
          stream.stderr.on('data', (data) => { errorOutput += data.toString(); });

          stream.on('close', (code) => {
            clearTimeout(timeout);
            conn.end();
            this.log.debug(`Command output: ${output}`);
            if (code === 0) {
              resolve(output);
            } else {
              reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
            }
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      conn.connect({
        host: this.host,
        port: this.port,
        username: this.username,
        password: this.password,
        readyTimeout: 8000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
        },
      });
    });
  }

  getServices() {
    return [this.informationService, this.switchService];
  }
}

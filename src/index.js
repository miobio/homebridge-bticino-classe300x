'use strict';

const { Client } = require('ssh2');

const PLUGIN_NAME = 'homebridge-bticino-classe300x';
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
    this.watchdogEnabled = config.watchdog !== false; // default true
    this.watchdogInterval = (config.watchdogInterval || 10) * 60 * 1000; // minutes to ms

    // Internal state
    this.doorState = this.api.hap.Characteristic.CurrentDoorState.CLOSED;
    this.targetDoorState = this.api.hap.Characteristic.TargetDoorState.CLOSED;
    this.intercomReachable = true;

    if (!this.host) {
      this.log.error('Missing required config: host');
      return;
    }

    // ── Accessory Information ──────────────────────────────────────────────
    this.informationService = new this.api.hap.Service.AccessoryInformation()
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'BTicino')
      .setCharacteristic(this.api.hap.Characteristic.Model, 'Classe 100X/300X')
      .setCharacteristic(this.api.hap.Characteristic.SerialNumber, this.host);

    // ── GarageDoor Service ─────────────────────────────────────────────────
    this.garageDoorService = new this.api.hap.Service.GarageDoorOpener(this.name);

    this.garageDoorService
      .getCharacteristic(this.api.hap.Characteristic.CurrentDoorState)
      .onGet(() => this.doorState);

    this.garageDoorService
      .getCharacteristic(this.api.hap.Characteristic.TargetDoorState)
      .onGet(() => this.targetDoorState)
      .onSet(this.handleDoorSet.bind(this));

    this.garageDoorService
      .getCharacteristic(this.api.hap.Characteristic.ObstructionDetected)
      .onGet(() => false);

    // ── Watchdog ContactSensor ─────────────────────────────────────────────
    if (this.watchdogEnabled) {
      this.watchdogService = new this.api.hap.Service.ContactSensor(
        'Intercom Not Working',
        'watchdog'
      );

      this.watchdogService
        .getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
        .onGet(() => {
          // CONTACT_DETECTED = 0 = OK, CONTACT_NOT_DETECTED = 1 = problem
          return this.intercomReachable
            ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
            : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        });

      this.log.info(`Watchdog enabled, checking every ${config.watchdogInterval || 10} minutes`);
      this._startWatchdog();
    }

    this.log.info(`BTicino Door Opener initialized for ${this.host}`);
  }

  // ── Door handling ────────────────────────────────────────────────────────

  handleDoorSet(value, callback) {
    // Only act on OPEN requests
    if (value !== this.api.hap.Characteristic.TargetDoorState.OPEN) {
      if (typeof callback === 'function') callback(null);
      return;
    }

    this.log.info('Opening door...');
    this.targetDoorState = this.api.hap.Characteristic.TargetDoorState.OPEN;
    this.doorState = this.api.hap.Characteristic.CurrentDoorState.OPENING;
    this.garageDoorService
      .getCharacteristic(this.api.hap.Characteristic.CurrentDoorState)
      .updateValue(this.doorState);

    this._openDoor()
      .then(() => {
        this.log.info('Door open command sent successfully ✅');
        this.doorState = this.api.hap.Characteristic.CurrentDoorState.OPEN;
        this.garageDoorService
          .getCharacteristic(this.api.hap.Characteristic.CurrentDoorState)
          .updateValue(this.doorState);
        if (typeof callback === 'function') callback(null);
      })
      .catch((err) => {
        this.log.error('Failed to open door ❌:', err.message);
        this.doorState = this.api.hap.Characteristic.CurrentDoorState.CLOSED;
        this.targetDoorState = this.api.hap.Characteristic.TargetDoorState.CLOSED;
        this.garageDoorService
          .getCharacteristic(this.api.hap.Characteristic.CurrentDoorState)
          .updateValue(this.doorState);
        this.garageDoorService
          .getCharacteristic(this.api.hap.Characteristic.TargetDoorState)
          .updateValue(this.targetDoorState);
        if (typeof callback === 'function') callback(err);
      })
      .finally(() => {
        // Auto-close after resetDelay
        setTimeout(() => {
          this.doorState = this.api.hap.Characteristic.CurrentDoorState.CLOSED;
          this.targetDoorState = this.api.hap.Characteristic.TargetDoorState.CLOSED;
          this.garageDoorService
            .getCharacteristic(this.api.hap.Characteristic.CurrentDoorState)
            .updateValue(this.doorState);
          this.garageDoorService
            .getCharacteristic(this.api.hap.Characteristic.TargetDoorState)
            .updateValue(this.targetDoorState);
          this.log.info(`Door reset to CLOSED after ${this.resetDelay / 1000}s`);
        }, this.resetDelay);
      });
  }

  // ── SSH door open command ────────────────────────────────────────────────

  _openDoor() {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('SSH connection timeout'));
      }, 10000);

      conn.on('ready', () => {
        this.log.debug('SSH connection established');
        const cmd = "echo '*8*19*20##' | nc 0 30006; sleep 1; echo '*8*20*20##' | nc 0 30006";

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

  // ── Watchdog ─────────────────────────────────────────────────────────────

  _startWatchdog() {
    setInterval(() => {
      this._checkSSH()
        .then(() => {
          if (!this.intercomReachable) {
            this.log.info('Intercom is reachable again ✅');
            this.intercomReachable = true;
            this.watchdogService
              .getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
              .updateValue(this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
          }
        })
        .catch(() => {
          if (this.intercomReachable) {
            this.log.warn('Intercom is NOT reachable ❌ - triggering alert');
            this.intercomReachable = false;
            this.watchdogService
              .getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
              .updateValue(this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
          }
        });
    }, this.watchdogInterval);
  }

  _checkSSH() {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('SSH check timeout'));
      }, 8000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        conn.end();
        resolve();
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
        readyTimeout: 6000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
        },
      });
    });
  }

  // ── Services ──────────────────────────────────────────────────────────────

  getServices() {
    const services = [this.informationService, this.garageDoorService];
    if (this.watchdogEnabled && this.watchdogService) {
      services.push(this.watchdogService);
    }
    return services;
  }
}

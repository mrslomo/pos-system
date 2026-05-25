const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');

class ScaleService extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.parser = null;
    this.connected = false;
    this.lastWeight = 0;
    this.buffer = '';
  }

  async connect(portPath, baudRate = 9600) {
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({ path: portPath, baudRate, autoOpen: false });
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        this.port.open((err) => {
          if (err) { reject(err); return; }
          this.connected = true;
          this.emit('connected', portPath);
          resolve(portPath);
        });

        this.parser.on('data', (data) => {
          const weight = this.parseWeight(data);
          if (weight !== null) {
            this.lastWeight = weight;
            this.emit('weight', weight);
          }
        });

        this.port.on('error', (err) => {
          this.connected = false;
          this.emit('error', err);
        });

        this.port.on('close', () => {
          this.connected = false;
          this.emit('disconnected');
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  parseWeight(data) {
    // Most scales output format: "ST,GS,+  1.500 kg" or just a number
    const match = data.match(/[\+\-]?\s*(\d+\.?\d*)\s*(kg|g|lb)?/i);
    if (match) {
      let weight = parseFloat(match[1]);
      const unit = match[2]?.toLowerCase();
      if (unit === 'g') weight = weight / 1000;
      else if (unit === 'lb') weight = weight * 0.453592;
      return weight;
    }
    return null;
  }

  disconnect() {
    if (this.port && this.connected) {
      this.port.close();
    }
  }

  getWeight() { return this.lastWeight; }
  isConnected() { return this.connected; }

  static async listPorts() {
    const ports = await SerialPort.list();
    return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer, description: p.friendlyName }));
  }
}

module.exports = new ScaleService();

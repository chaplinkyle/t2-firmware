var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Duplex = require('stream').Duplex;
var net = require('net');

function Tessel() {
    if (Tessel.instance) {
        return Tessel.instance;
    } else {
        Tessel.instance = this;
    }
    this.ports = {
        A: new Port('A', '/var/run/tessel/port_a'),
        B: new Port('B', '/var/run/tessel/port_b')
    };
    this.port = this.ports;
}

function Port(name, socketPath) {
    // Connection to the SPI daemon
    this.sock = net.createConnection({path: socketPath}, function(e) {
        console.log('connect', e)
    });

    this.sock.on('error', function(e) {
        console.log('sock err', e)
    })

    this.sock.on('close', function() {
        throw new Error("Port socket closed");
    })

    this.sock.on('readable', function() {
        while (this.replyQueue.length > 0) {
            var d = this.sock.read(1);

            if (!d) break;
            var byte = d[0];
            var data = null;
            var data_size = this.replyQueue[0].size;

            if (byte == REPLY.DATA) {
                if (!data_size) {
                    throw new Error("Received unexpected data packet");
                }
                data = this.sock.read(data_size);
                if (!data) {
                    this.sock.unshift(data);
                    this.sock.unshift(d);
                    break;
                }
            } else if (byte >= REPLY.MIN_ASYNC) {
                this.emit('async-event', byte);
                continue;
            }

            var q = this.replyQueue.shift();
            if (q.callback) {
                q.callback.call(this, null, q.size ? data : byte);
            }
        }
    }.bind(this));

    // Active peripheral: 'none', 'i2c', 'spi', 'uart'
    this.mode = 'none';

    // Array of {size, callback} used to dispatch replies
    this.replyQueue = [];

    this.digital = [];
    for (var i=0; i<8; i++) {
        this.digital.push(new Pin(i, this));
    }
}

Port.prototype.cork = function() {
    this.sock.cork();
}

Port.prototype.uncork = function() {
    this.sock.uncork();
}

Port.prototype.sync = function(cb) {
    if (cb) {
        this.sock.write(new Buffer([CMD.ECHO, 1, 0x88]));
        this.replyQueue.push({
            size: 1,
            callback: function(err, data) {
                cb(null);
            }
        });
    }
}

Port.prototype._simple_cmd = function(buf, cb) {
    this.cork()
    this.sock.write(new Buffer(buf))
    this.sync(cb)
    this.uncork()
}

Port.prototype._status_cmd = function(buf, cb) {
    this.sock.write(new Buffer(buf));
    this.replyQueue.push({
        size: 0,
        callback: cb,
    });
}

Port.prototype._tx = function(buf, cb) {
    if (buf.length == 0) {
        throw new Error("Length must be non-zero");
    } else if (buf.length > 255) {
        // TODO: split into sequence of commands
        throw new Error("Buffer size must be less than 255");
    }

    this.cork();
    this.sock.write(new Buffer([CMD.TX, buf.length]))
    this.sock.write(buf);
    this.sync(cb);
    this.uncork();
}

Port.prototype._rx = function(len, cb) {
    if (len == 0) {
        throw new Error("Length must be non-zero");
    } else if (len > 255) {
        // TODO: split into sequence of commands
        throw new Error("Buffer size must be less than 255");
    }

    this.sock.write(new Buffer([CMD.RX, len]));
    this.replyQueue.push({
        size: len,
        callback: cb,
    });
}

Port.prototype._txrx = function(buf, cb) {
    if (buf.length == 0) {
        throw new Error("Length must be non-zero");
    } else if (buf.length > 255) {
        // TODO: split into sequence of commands
        throw new Error("Buffer size must be less than 255");
    }

    this.cork();
    this.sock.write(new Buffer([CMD.TXRX, buf.length]))
    this.sock.write(buf);
    this.replyQueue.push({
        size: buf.length(),
        callback: cb,
    });
    this.uncork();
}

Port.prototype.I2C = function (addr, mode) {
    this._simple_cmd([CMD.ENABLE_I2C, 0]);
    return new I2C(addr, this);
};

Port.prototype.SPI = function (format) {
    return new SPI(format, this);
};

Port.prototype.UART = function (format) {
    return new UART(this);
};

function Pin (pin, port) {
    this.pin = pin;
    this._port = port;
    this.interrupts = {};
    this.isPWM = false;
}

util.inherits(Pin, EventEmitter);

Pin.prototype.high = function(cb) {
    this._port._simple_cmd([CMD.GPIO_HIGH, this.pin], cb);
    return this;
}

Pin.prototype.low = function(cb) {
    this._port._simple_cmd([CMD.GPIO_LOW, this.pin], cb);
    return this;
}

Pin.prototype.toggle = function(cb) {
    this._port._simple_cmd([CMD.GPIO_TOGGLE, this.pin], cb);
    return this;
}

Pin.prototype.output = function output(initialValue, cb) {
    if (initialValue) {
        this.high(cb);
    } else {
        this.low(cb);
    }
    return this;
}

function I2C(addr, port) {
    this.addr = addr;
    this._port = port;
}

I2C.prototype.send = function(data, callback) {
    this._port.cork();
    this._port._simple_cmd([CMD.START, this.addr << 1]);
    this._port._tx(data);
    this._port._simple_cmd([CMD.STOP], callback);
    this._port.uncork();
}

I2C.prototype.read = function(length, callback) {
    this._port.cork();
    this._port._simple_cmd([CMD.START, this.addr << 1 | 1]);
    this._port._rx(length, callback);
    this._port._simple_cmd([CMD.STOP]);
    this._port.uncork();
}

I2C.prototype.transfer = function(txbuf, rxlen, callback) {
    this._port.cork();
    if (txbuf.length > 0) {
        this._port._simple_cmd([CMD.START, this.addr << 1]);
        this._port._tx(txbuf);
    }
    this._port._simple_cmd([CMD.START, this.addr << 1 | 1]);
    this._port._rx(rxlen, callback);
    this._port._simple_cmd([CMD.STOP]);
    this._port.uncork();
}

function SPI(port) {
    throw new Error("Unimplemented")
}

function UART(port) {
    throw new Error("Unimplemented")
}

var CMD = {
    NOP: 0,
    FLUSH: 1,
    ECHO: 2,
    GPIO_IN: 3,
    GPIO_HIGH: 4,
    GPIO_LOW: 5,
    GPIO_TOGGLE: 21,
    GPIO_CFG: 6,
    GPIO_WAIT: 7,
    GPIO_INT: 8,
    ENABLE_SPI: 10,
    DISABLE_SPI: 11,
    ENABLE_I2C: 12,
    DISABLE_I2C: 13,
    ENABLE_UART: 14,
    DISABLE_UART: 15,
    TX: 16,
    RX: 17,
    TXRX: 18,
    START: 19,
    STOP: 20,
};

var REPLY = {
    ACK:  0x80,
    NACK: 0x81,
    HIGH: 0x82,
    LOW:  0x83,
    DATA: 0x84,

    MIN_ASYNC: 0xA0,
    ASYNC_PIN_CHANGE_N: 0xC0,
};

module.exports = new Tessel();

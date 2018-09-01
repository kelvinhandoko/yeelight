import { createSocket, Socket } from "dgram";
import { EventEmitter } from "events";
import { AddressInfo } from "net";
import { defaultLogger } from "./logger";
import { IDevice } from "./models/device";
import { IDiscoverConfig } from "./models/discover-config";
import { ILogger } from "./models/logger";
import { Utils } from "./utils";

/**
 * The class to discover yeelight device on wifi network using UDP package
 * @constructor
 * @param {string} title - Yeelight Discover
 * @param {string} author - samuraitruong@hotmail.com
 */
export class Discover extends EventEmitter {
    private devices: IDevice[];
    private options: IDiscoverConfig = {
        debug: true,
        host: "",
        limit: 1,
        multicastHost: "239.255.255.250",
        port: 1982,
        timeout: 10000,
    };
    private client: Socket;
    /**
     * @constructor
     * @param {IDiscoverConfig } options discover object include the port and multicast host.
     * @param {ILogger} logger  the application logger which implement of log, info, debug and error function
     */
    constructor(options: IDiscoverConfig, private logger?: ILogger) {
        super();
        this.devices = [];
        this.options = { ...this.options, ...options };
        this.client = createSocket("udp4");
        this.client.on("message", this.onSocketMessage.bind(this));
        this.logger = logger || defaultLogger;
    }
    /**
     * The class to discover yeelight device on wifi network using UDP package
     * @constructor
     * @param {string} title - Yeelight Discover
     * @param {string} author
     * @returns {Promise<IDevice | IDevice[]>} a promise that could resolve to 1 or many devices on the network
     */
    public start(): Promise<IDevice | IDevice[]> {
        const me = this;
        return new Promise((resolve, reject) => {
            this.client.bind(this.options.port, this.options.host, () => {
                me.client.setBroadcast(true);
                me.client.send(me.getMessage(), me.options.port, me.options.multicastHost, (err) => {
                    if (err) {
                        console.log("ERROR", err);
                        reject(err);
                    } else {
                        let ts = 0;
                        const interval = 200;
                        const timer = setInterval(() => {
                            ts += interval;
                            if (this.devices.length >= this.options.limit) {
                                clearInterval(timer);
                                resolve(this.devices);
                            }
                            if (this.options.timeout > 0 && this.options.timeout < ts) {
                                if (this.devices.length > 0) {
                                    clearInterval(timer);
                                    resolve(this.devices);
                                } else {
                                    clearInterval(timer);
                                    reject("No device found after timeout exceeded : " + ts);
                                }
                            }
                        }, interval);
                    }
                });
            });
        });
    }
    /**
     * Clean up resource and close all open connection,
     * call this function after you finish your action to avoid memory leak
     * @returns {Promise} return a promise, fullfil will call after internal socket connection dropped
     */
    public destroy(): Promise<void> {
        if (!this.client) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.removeAllListeners();
            if (this.client) {
                this.client.close(resolve);
            }
        });
    }
    /**
     * Generate the UDP message to discover device on local network.
     */
    private getMessage(): Buffer {
        // tslint:disable-next-line:max-line-length
        const message = `M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1982\r\nMAN: "ssdp:discover"\r\nST: wifi_bulb\r\n`;
        return Buffer.from(message);
    }
    /**
     * The event run when recieved the message devices
     * @param {Buffer} buffer the buffer revieved from the socket
     * @param {AddressInfo} address the TCP info of the devices who send the message
     */
    private onSocketMessage(buffer: Buffer, address: AddressInfo) {
        const message = buffer.toString();
        if (this.options.debug && this.logger) {
            this.logger.info(message);
        }
        const device = Utils.parseDeviceInfo(message);
        if (device) {
            this.addDevice(device);
            this.emit("deviceAdded", device);
        }
    }
    /**
     * Add the new discovered device into the internal list
     * @param {IDevice} device - the new device found from network
     * @returns {0 |1 } return 0 if device already existing, 1 if new device added to the list
     */
    private addDevice(device: IDevice): 0 | 1 {
        const existDevice = this.devices.findIndex((x) => x.id === device.id);
        if (existDevice <= 0) {
            this.devices.push(device);
            return 1;
        }
        this.devices[existDevice] = device;
        return 0;
    }
}
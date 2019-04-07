import {writeFile} from 'fs';

export class Config {
    public path: string;
    public domain: string;
    public cert?: Buffer;
    public key?: Buffer;
    public users: { [s: string]: string };
    public port: number = 8080;
    public address: string = '0.0.0.0';
    public ssl: {
        port: number;
        enabled: boolean;
        cert?: string;
        key?: string;
    } = {
        port: 443,
        enabled: false
    };

    async save() {
        const { cert, key, ...config } = this;
        return writeFile(this.path, JSON.stringify(config), { encoding: 'utf8' }, console.info);
    }

    getUserNames() {
        return Object.keys(this.users);
    }
}
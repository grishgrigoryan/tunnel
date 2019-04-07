import * as optimist from "optimist";
import {Client}      from "@tunnels/client";
import {toBool}      from "@tunnels/common";

export class ClientCli {

    public options = optimist
        .usage('Command: connect [options]')
        .options('secure', {
            default: 'true',
            describe: 'use this flag to indicate proxy over https'
        })
        .options('auth', {
            describe: 'username:password'
        })
        .options('p', {
            alias: 'port',
            describe: 'listen on this port for outside requests'
        })
        .options('h', {
            alias: 'host',
            default: '0.0.0.0',
            describe: 'IP address to bind to'
        })
        .options('d', {
            alias: 'domain',
            default: 'mamble.io',
            describe: 'tunnels domain to use',
        })
        .options('s', {
            alias: 'subdomain',
            default: `tunnel-${Math.floor(Math.random() * 100)}`,
            describe: 'tunnels subdomain to use',
        });

    public async run() {
        const argv = this.options.argv;
        if (!argv.port) {
            this.help();
            console.error('port is required');
            process.exit();
        }

        const client = new Client({
            port:argv.port,
            host:argv.host,
            auth:argv.auth,
            domain:argv.domain,
            ssl:toBool(argv.secure),
            subdomain:argv.subdomain
        });
        await client.create();

        console.info("http : ",client.http);
        console.info("https: ",client.https);
        console.info("admin: ",client.url);
        const close = async ()=>{
            await client.close();
            console.log('  Tunnel closed.')
            process.exit(0)
        };
        process.on('SIGINT', close);
        process.on('SIGTERM', close);
    }

    public help(){
        this.options.showHelp();
    }
}
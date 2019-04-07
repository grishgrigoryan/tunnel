import * as http                 from 'http';
import * as https                from 'https';
import {logger, LoggerInterface} from "@tunnels/common";
import {TunnelManager}           from "./TunnelManager";
import {Config}                  from "./Config";
import * as httpProxy            from 'http-proxy';
import {Pattern}                 from "@tunnels/common";
import {writeJson}               from "@tunnels/common";
import {ProxyRequests}           from "./ProxyRequests";
import * as WebSocket            from "ws"

export class Server {

    @logger()
    readonly logger: LoggerInterface;

    protected server: http.Server = null;
    protected secureServer: https.Server = null;
    public proxy: httpProxy = null;
    public manager: TunnelManager;
    public config: Config;
    public routes: Pattern<any>[];
    public proxyRequests: ProxyRequests;
    public wss: WebSocket.Server;

    constructor(config: Config) {
        this.config = config;
        this.manager = new TunnelManager();
        this.proxy = httpProxy.createProxyServer({ ws: true });
        this.wss = new WebSocket.Server({ noServer: true });
        this.proxyRequests = new ProxyRequests(this);
        this.routes = [
            Pattern.regexp(`/api/tunnels/:id`, {
                get: this.doRegister.bind(this)
            }),
            Pattern.regexp(`/api/tunnels/:id`, {
                delete: this.doRemove.bind(this)
            }),
            Pattern.regexp(`/api/tunnels`, {
                get: this.getTunnels.bind(this)
            })
        ]
    }

    public run() {
        const { port, ssl, cert, key } = this.config;
        this.server = http.createServer();
        this.server.on('request', this.doRequest.bind(this));
        this.server.on('upgrade', this.doUpgrade.bind(this));
        this.server.listen(port, this.config.address);
        console.log('Server listening on port', this.config.port);
        if (ssl.enabled) {
            this.secureServer = https.createServer({
                key: key,
                cert: cert
            });
            this.secureServer.on('request', this.doRequest.bind(this));
            this.secureServer.on('upgrade', this.doUpgrade.bind(this));
            this.secureServer.listen(ssl.port);
            console.log('Secure server listening on port', this.config.ssl.port);
        }
        return this
    }

    get id(): Pattern<any> {
        return Pattern.regexp(`:subdomain.${this.config.domain}`, null);
    }

    public getTunnelByHost(host: string) {
        let matched = String(this.hostname(host)).match(this.id);
        if (matched) {
            return this.manager.getTunnel(matched[1]);
        }
    }

    public getProxyUrl(internetPort) {
        const { domain } = this.config;
        return `${domain}:${internetPort}`;
    }

    protected basicAuth(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const auth = req.headers['authorization'];
            const unauthorized = () => {
                writeJson(res, 401, {
                    error: 'Invalid Credentials'
                }, {
                    'WWW-Authenticate': `Basic realm="${this.config.domain}", charset="UTF-8"`,
                });
            };
            const decode = (auth: string) => {
                return Buffer.from(auth.split(' ')[1], 'base64')
                    .toString()
                    .split(':');
            };
            if (!auth) {
                unauthorized();
            } else {
                const { users } = this.config;
                const [username, password] = decode(String(auth));
                if (users[username] === password) {
                    req['auth'] = username;
                    return true;
                }
                unauthorized();
            }
        } catch (ex) {
            return false
        }
    }

    async doRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        if (this.basicAuth(req, res)) {
            if (this.hostname(req.headers.host) === this.config.domain) {
                try {
                    const result = await this.route(req.method, req.url, req['auth']);
                    if (result) {
                        writeJson(res, 200, result);
                    } else {
                        writeJson(res, 404, {
                            status: 404,
                            error: 'Not Found'
                        });
                    }
                } catch (e) {
                    writeJson(res, 400, {
                        status: 400,
                        error: e.message
                    });
                }

            } else {
                let tunnel = this.getTunnelByHost(req.headers.host);
                if (tunnel) {
                    this.proxy.web(req, res, { target: `http://${this.getProxyUrl(tunnel.internetPort)}` })
                } else {
                    res.writeHead(502);
                    res.end('Bad Gateway');
                }
            }
        }
    }

    protected doUpgrade(req, socket, head) {
        if (this.hostname(req.headers.host) === this.config.domain) {
            const auth = this.proxyRequests.authorize(req);
            if (!auth) {
                socket.destroy();
            } else {
                this.wss.handleUpgrade(req, socket, head, (ws) => {
                    this.wss.emit('connection', ws, req, auth);
                });
            }
        } else {
            let tunnel = this.getTunnelByHost(req.headers.host);
            if (tunnel) {
                this.proxy.ws(req, socket, head, { target: `ws://${this.getProxyUrl(tunnel.internetPort)}` })
            } else {
                socket.destroy();
            }
        }
    };

    async doRegister(subdomain: string, username) {
        let tunnel = this.manager.getTunnel(subdomain);
        if (tunnel) {
            throw new Error('already connected')
        }
        tunnel = await this.manager.newTunnel(subdomain, username);
        const json = tunnel.toJSON();
        this.proxyRequests.broadcast('create:tunnel', json);
        return json;
    }

    async doRemove(subdomain: string) {
        let tunnel = this.manager.getTunnel(subdomain);
        if (tunnel) {
            this.manager.remove(subdomain);
            this.proxyRequests.broadcast('remove:tunnel', tunnel.toJSON());
        }
        return {};
    }

    async getTunnels() {
        return this.manager.toJSON();
    }

    async route(method: string, path: string, username) {
        method = method.toLocaleLowerCase();
        for (const r of this.routes) {
            let matched = path.match(r);
            if (matched) {
                let [full, ...params] = matched;
                if (r.meta[method]) {
                    return await r.meta[method](...params, username);
                }

            }
        }
    }

    hostname = (host) => {
        return String(host).split(":")[0]
    };

    public close() {
        this.proxy.close();
        this.manager.removeAll();
        this.server.close();
        if (this.secureServer) {
            this.secureServer.close();
        }
        this.logger.debug('closed');
    }
}

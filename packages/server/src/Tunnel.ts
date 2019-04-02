import {RelayServer}             from "./Net";
import {logger, LoggerInterface} from "@tunnel/common";

export class Tunnel<R extends RelayServer = RelayServer> {

    @logger()
    readonly logger: LoggerInterface;

    public createdAt: Date;

    constructor(
        public id:string,
        public internetPort:number,
        public relay: R
    ) {
        this.internetPort = internetPort;
        this.relay = relay;
        this.createdAt = new Date();
        this.logger.debug(`created`, { id, internetPort, relay });
    }

    toJSON(){
        return {
            id:this.id,
            internetPort:this.internetPort,
            relayPort:this.relay.relayPort,
            createdAt:this.createdAt
        }
    }
}
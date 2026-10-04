export function resourcePollInterval(normal:number,quick:boolean,fastUntil:number,now:number){return quick&&now<fastUntil?3000:normal;}

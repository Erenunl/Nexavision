import { basename, extname } from "node:path";
import { ChannelType, EmbedBuilder, type Client } from "discord.js";
import type { GuildConfigService } from "./guildConfigService.js";

export class NowPlayingService {
  constructor(private client:Client,private configs:GuildConfigService){}
  async update(guildId:string,state:'PLAYING'|'PAUSED'|'STOPPED',file:string|null):Promise<void>{const cfg=this.configs.get(guildId);if(!cfg.channels.nowPlaying)return;const ch=await this.client.channels.fetch(cfg.channels.nowPlaying);if(!ch||ch.type!==ChannelType.GuildText||ch.guildId!==guildId)throw new Error('NOW_PLAYING_CHANNEL_MISSING');let description='Sahne müziği sona erdi.';let title='🎵 Şimdi Çalıyor';if(file){const clean=basename(file,extname(file));const parts=clean.split(' - ');const song=parts.length>1?parts.slice(1).join(' - '):clean;const artist=parts.length>1?parts[0]!:null;description=`${artist?`**${artist}**\n`:''}${song}`;}if(state==='PAUSED')title='⏸️ Duraklatıldı';if(state==='STOPPED')title='⏹️ Sahne Müziği';const embed=new EmbedBuilder().setTitle(title).setDescription(description).setColor(state==='PLAYING'?0x57f287:0x5865f2);let msg=cfg.messages.nowPlaying?await ch.messages.fetch(cfg.messages.nowPlaying).catch(()=>null):null;if(msg)await msg.edit({embeds:[embed]});else{msg=await ch.send({embeds:[embed]});await this.configs.setMessageId(guildId,'nowPlaying',msg.id);}}
}

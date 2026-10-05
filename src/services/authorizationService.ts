import { PermissionFlagsBits, type GuildMember, type Guild } from "discord.js";
import type { GuildConfigService } from "./guildConfigService.js";

export class AuthorizationService {
  constructor(private readonly configs: GuildConfigService) {}

  canManageSettings(guild: Guild, member: GuildMember): boolean {
    if (guild.ownerId === member.id) return true;
    const adminRoleId = this.configs.get(guild.id).roles.admin;
    if (adminRoleId) return member.roles.cache.has(adminRoleId);
    return member.permissions.has(PermissionFlagsBits.Administrator);
  }

  canReviewSongs(guild: Guild, member: GuildMember): boolean {
    const adminRoleId = this.configs.get(guild.id).roles.admin;
    return Boolean(adminRoleId && member.roles.cache.has(adminRoleId));
  }
}

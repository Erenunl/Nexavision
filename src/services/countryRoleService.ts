import type { Guild, GuildMember, Role } from "discord.js";
import { EUROVISION_COUNTRIES, getCountry } from "../config/countries.js";
import type { GuildConfigService } from "./guildConfigService.js";

export interface CountryRoleSetupResult {
  alreadyComplete: boolean;
  created: number;
  reused: number;
}

export interface GrantedCountryRole {
  member: GuildMember;
  role: Role;
  roleAdded: boolean;
}

export class CountryRoleService {
  constructor(private readonly configs: GuildConfigService) {}

  async initializeRoles(guild: Guild): Promise<CountryRoleSetupResult> {
    await guild.roles.fetch();
    const config = this.configs.get(guild.id);
    const resolvedRoles: Record<string, string> = {};
    let created = 0;
    let reused = 0;

    const allConfiguredRolesValid = EUROVISION_COUNTRIES.every((country) => {
      const roleId = config.countryRoles[country.code];
      const role = roleId ? guild.roles.cache.get(roleId) : null;
      return role?.name === country.roleName;
    });
    if (config.countryRolesInitialized && allConfiguredRolesValid) {
      return { alreadyComplete: true, created: 0, reused: EUROVISION_COUNTRIES.length };
    }

    try {
      for (const country of EUROVISION_COUNTRIES) {
        const mappedRoleId = config.countryRoles[country.code];
        let role = mappedRoleId ? guild.roles.cache.get(mappedRoleId) : undefined;
        if (role?.name !== country.roleName) {
          role = guild.roles.cache.find((candidate) => candidate.name === country.roleName);
        }
        if (role) {
          reused += 1;
        } else {
          role = await guild.roles.create({
            name: country.roleName,
            permissions: [],
            reason: "NEXAVISION ülke rolleri kurulumu",
          });
          created += 1;
        }
        resolvedRoles[country.code] = role.id;
      }
    } catch (error) {
      await this.configs.setCountryRoleConfiguration(guild.id, resolvedRoles, false);
      throw error;
    }

    await this.configs.setCountryRoleConfiguration(guild.id, resolvedRoles, true);
    return { alreadyComplete: false, created, reused };
  }

  async getCountryRole(guild: Guild, countryCode: string): Promise<Role | null> {
    const country = getCountry(countryCode);
    const roleId = this.configs.get(guild.id).countryRoles[countryCode];
    if (!country || !roleId) return null;
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    return role?.name === country.roleName ? role : null;
  }

  async grantCountryRole(guild: Guild, discordUserId: string, countryCode: string): Promise<GrantedCountryRole> {
    const role = await this.getCountryRole(guild, countryCode);
    if (!role) throw new Error(`COUNTRY_ROLE_NOT_FOUND:${countryCode}`);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) throw new Error(`GUILD_MEMBER_NOT_FOUND:${discordUserId}`);
    if (member.roles.cache.has(role.id)) return { member, role, roleAdded: false };
    await member.roles.add(role, "Ülke başvurusu onaylandı");
    return { member, role, roleAdded: true };
  }

  async removeCountryRole(member: GuildMember, role: Role): Promise<void> {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, "Ülke assignment işlemi geri alındı");
    }
  }
}

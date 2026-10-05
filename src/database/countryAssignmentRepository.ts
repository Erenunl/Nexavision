import { getCountry } from "../config/countries.js";
import type { CountryAssignment } from "../types/country.js";
import type { AssignedParticipant } from "../types/submission.js";
import { getDatabase } from "./connection.js";

interface AssignmentRow {
  id: number;
  guild_id: string;
  country_code: string;
  discord_user_id: string;
  assigned_at: string;
  approved_by: string;
  active: number;
}

function fromRow(row: AssignmentRow): CountryAssignment {
  return {
    id: row.id,
    guildId: row.guild_id,
    countryCode: row.country_code,
    discordUserId: row.discord_user_id,
    assignedAt: row.assigned_at,
    approvedBy: row.approved_by,
    active: row.active === 1,
  };
}

export class CountryAssignmentRepository {
  findActiveByUser(guildId: string, discordUserId: string): CountryAssignment | null {
    const row = getDatabase()
      .prepare(
        `SELECT * FROM country_assignments
         WHERE guild_id = ? AND discord_user_id = ? AND active = 1 LIMIT 1`,
      )
      .get(guildId, discordUserId) as AssignmentRow | undefined;
    return row ? fromRow(row) : null;
  }

  findActiveByCountry(guildId: string, countryCode: string): CountryAssignment | null {
    const row = getDatabase()
      .prepare(
        `SELECT * FROM country_assignments
         WHERE guild_id = ? AND country_code = ? AND active = 1 LIMIT 1`,
      )
      .get(guildId, countryCode) as AssignmentRow | undefined;
    return row ? fromRow(row) : null;
  }

  listActive(guildId: string): CountryAssignment[] {
    const rows = getDatabase()
      .prepare("SELECT * FROM country_assignments WHERE guild_id = ? AND active = 1 ORDER BY country_code")
      .all(guildId) as AssignmentRow[];
    return rows.map(fromRow);
  }

  findActiveParticipant(guildId: string, discordUserId: string): AssignedParticipant | null {
    const assignment = this.findActiveByUser(guildId, discordUserId);
    if (!assignment) return null;
    const country = getCountry(assignment.countryCode);
    if (!country) return null;
    return {
      guildId,
      discordUserId,
      countryCode: country.code,
      countryName: country.nameTr,
      countryFlag: country.flag,
    };
  }

  deactivateCountry(guildId:string,countryCode:string):CountryAssignment|null {const current=this.findActiveByCountry(guildId,countryCode);if(!current)return null;const changed=getDatabase().prepare("UPDATE country_assignments SET active=0 WHERE id=? AND active=1").run(current.id).changes;return changed?current:null;}

  replaceCountry(guildId:string,countryCode:string,newUserId:string,adminId:string):{old:CountryAssignment|null;created:CountryAssignment}{const db=getDatabase();return db.transaction(()=>{const conflict=this.findActiveByUser(guildId,newUserId);if(conflict&&conflict.countryCode!==countryCode)throw new Error(`USER_ALREADY_ASSIGNED:${conflict.countryCode}`);const old=this.findActiveByCountry(guildId,countryCode);if(old?.discordUserId===newUserId)return {old,created:old};if(old)db.prepare("UPDATE country_assignments SET active=0 WHERE id=? AND active=1").run(old.id);const result=db.prepare("INSERT INTO country_assignments(guild_id,country_code,discord_user_id,assigned_at,approved_by,active) VALUES(?,?,?,?,?,1)").run(guildId,countryCode,newUserId,new Date().toISOString(),adminId);const created=db.prepare("SELECT * FROM country_assignments WHERE id=?").get(result.lastInsertRowid) as AssignmentRow;return {old,created:fromRow(created)};})();}
}

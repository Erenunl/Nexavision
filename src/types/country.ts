export type CountryApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CountryAssignment {
  id: number;
  guildId: string;
  countryCode: string;
  discordUserId: string;
  assignedAt: string;
  approvedBy: string;
  active: boolean;
}

export interface CountryApplication {
  id: number;
  guildId: string;
  discordUserId: string;
  countryCode: string;
  status: CountryApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  adminChannelId: string | null;
  adminMessageId: string | null;
}

export type CountryApplicationCreateResult =
  | { ok: true; application: CountryApplication }
  | {
      ok: false;
      reason: "already_assigned" | "country_taken" | "user_pending" | "country_pending";
      countryCode?: string;
    };

export type CountryApprovalResult =
  | { ok: true; assignment: CountryAssignment }
  | {
      ok: false;
      reason: "not_pending" | "already_assigned" | "country_taken";
      countryCode?: string;
    };

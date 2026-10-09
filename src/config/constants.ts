export const DATA_CHANNEL_ID = "1556686336109314148";
export const CONFIG_MESSAGE_PREFIX = "FSC_CONFIG:";
export const CONFIG_VERSION = 5;
export const DEFAULT_MAX_VIEW_COUNT = 300_000;
export const TEMPORARY_MESSAGE_TTL_MS = 12_000;

export const CUSTOM_IDS = {
  settingsSection: "settings:section",
  settingsChannelKey: "settings:channel-key",
  settingsChannelPrefix: "settings:channel:",
  settingsAdminRole: "settings:role:admin",
  settingsWinnerRole: "settings:role:winner",
  settingsMaxViewsButton: "settings:rules:maxViews",
  settingsMaxViewsModal: "settings:rules:maxViews:modal",
  settingsDeadlineSong: "settings:deadline:song",
  settingsDeadlineVoting: "settings:deadline:voting",
  settingsDeadlineModalPrefix: "settings:deadline:modal:",
  approvePrefix: "song:approve:",
  rejectPrefix: "song:reject:",
  rejectModalPrefix: "song:reject-modal:",
  countryApplyPrefix: "country:apply:",
  countryApprovePrefix: "country:approve:",
  countryRejectPrefix: "country:reject:",
  countryRejectModalPrefix: "country:reject-modal:",
  voteSelectPrefix: "vote:select:",
  voteSubmit: "vote:submit",
  voteEdit: "vote:edit",
  voteCancel: "vote:cancel",
  voteResetPrefix: "vote:reset:",
  voteResetCancel: "vote:reset-cancel",
  resultFinishConfirm: "result:finish:confirm",
  resultFinishCancel: "result:finish:cancel",
  countryRemovePrefix: "country:manage:remove:",
  countryRemoveCancel: "country:manage:remove-cancel",
  songChangeApprovePrefix: "song-change:approve:",
  songChangeRejectPrefix: "song-change:reject:",
  songChangeRejectModalPrefix: "song-change:reject-modal:",
} as const;

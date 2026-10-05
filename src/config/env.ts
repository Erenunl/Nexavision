import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Eksik zorunlu ortam değişkeni: ${name}`);
  }
  return value;
}

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  youtubeApiKey: required("YOUTUBE_API_KEY"),
};

import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Guild, StageChannel } from "discord.js";
import type { LogService } from "./logService.js";
import type { NowPlayingService } from "./nowPlayingService.js";

export const MUSIC_DIRECTORY = fileURLToPath(new URL("../../music/", import.meta.url));

export type StageMusicState = "STOPPED" | "PLAYING" | "PAUSED";
export type StageStartResult = "STARTED" | "ALREADY_ACTIVE" | "NO_TRACKS";
export type StagePauseResult = "PAUSED" | "NOT_PLAYING" | "ALREADY_PAUSED";
export type StageResumeResult = "RESUMED" | "NOT_ACTIVE" | "NOT_PAUSED";
export type StageStopResult = "STOPPED" | "NOT_ACTIVE";

interface TrackMetadata {
  serial: number;
  track: string;
}

interface StageSession {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  playlist: string[];
  index: number;
  currentTrack: string | null;
  currentSerial: number;
  handledSerial: number | null;
  lastPlayed: string | null;
  state: Exclude<StageMusicState, "STOPPED">;
  transcoder: ChildProcess | null;
  failedTracks: Set<string>;
  advanceOnResume: boolean;
}

export interface StageMusicStatus {
  state: StageMusicState;
  channelId: string | null;
  currentTrack: string | null;
  playlist: readonly string[];
  index: number;
}

export async function listMp3Files(directory = MUSIC_DIRECTORY): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase("en-US").endsWith(".mp3"))
    .map((entry) => resolve(directory, entry.name))
    .sort((left, right) => left.localeCompare(right, "tr"));
}

export function shuffleTracks(
  tracks: readonly string[],
  lastPlayed: string | null = null,
  random: () => number = Math.random,
): string[] {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  if (lastPlayed && shuffled.length > 1 && shuffled[0] === lastPlayed) {
    const differentIndex = shuffled.findIndex((track) => track !== lastPlayed);
    if (differentIndex > 0) {
      [shuffled[0], shuffled[differentIndex]] = [shuffled[differentIndex]!, shuffled[0]!];
    }
  }
  return shuffled;
}

export class StageMusicService {
  private readonly sessions = new Map<string, StageSession>();
  private readonly startingGuilds = new Set<string>();

  constructor(private readonly logs: LogService, private readonly nowPlaying?: NowPlayingService) {}

  getStatus(guildId: string): StageMusicStatus {
    const session = this.sessions.get(guildId);
    if (!session) {
      return { state: "STOPPED", channelId: null, currentTrack: null, playlist: [], index: 0 };
    }
    return {
      state: session.state,
      channelId: session.channelId,
      currentTrack: session.currentTrack ? basename(session.currentTrack) : null,
      playlist: session.playlist.map((track) => basename(track)),
      index: session.index,
    };
  }

  async start(guild: Guild, channel: StageChannel): Promise<StageStartResult> {
    if (this.sessions.has(guild.id) || this.startingGuilds.has(guild.id)) return "ALREADY_ACTIVE";
    this.startingGuilds.add(guild.id);

    try {
      const tracks = await listMp3Files().catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      if (tracks.length === 0) return "NO_TRACKS";

      const connection = joinVoiceChannel({
        guildId: guild.id,
        channelId: channel.id,
        adapterCreator: guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
      });
      const session: StageSession = {
        guildId: guild.id,
        channelId: channel.id,
        connection,
        player,
        playlist: shuffleTracks(tracks),
        index: 0,
        currentTrack: null,
        currentSerial: 0,
        handledSerial: null,
        lastPlayed: null,
        state: "PLAYING",
        transcoder: null,
        failedTracks: new Set<string>(),
        advanceOnResume: false,
      };
      this.sessions.set(guild.id, session);
      this.bindSessionEvents(session);

      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        const botMember = await guild.members.fetchMe();
        await botMember.voice.setSuppressed(false);
        connection.subscribe(player);
        this.playNext(session);
        await entersState(player, AudioPlayerStatus.Playing, 15_000);
        return "STARTED";
      } catch (error) {
        this.destroySession(session);
        throw error;
      }
    } finally {
      this.startingGuilds.delete(guild.id);
    }
  }

  pause(guildId: string): StagePauseResult {
    const session = this.sessions.get(guildId);
    if (!session) return "NOT_PLAYING";
    if (session.state === "PAUSED") return "ALREADY_PAUSED";
    if (!session.player.pause()) return "NOT_PLAYING";
    session.state = "PAUSED";
    void this.nowPlaying?.update(guildId, "PAUSED", session.currentTrack).catch((error) => this.logs.error(guildId, "Şimdi Çalıyor mesajı güncellenemedi.", error));
    return "PAUSED";
  }

  resume(guildId: string): StageResumeResult {
    const session = this.sessions.get(guildId);
    if (!session) return "NOT_ACTIVE";
    if (session.state !== "PAUSED") return "NOT_PAUSED";

    session.state = "PLAYING";
    if (session.advanceOnResume) {
      session.advanceOnResume = false;
      this.playNext(session);
      void this.nowPlaying?.update(guildId, "PLAYING", session.currentTrack).catch((error) => this.logs.error(guildId, "Şimdi Çalıyor mesajı güncellenemedi.", error));
      return "RESUMED";
    }
    if (!session.player.unpause()) {
      session.state = "PAUSED";
      return "NOT_PAUSED";
    }
    void this.nowPlaying?.update(guildId, "PLAYING", session.currentTrack).catch((error) => this.logs.error(guildId, "Şimdi Çalıyor mesajı güncellenemedi.", error));
    return "RESUMED";
  }

  stop(guildId: string): StageStopResult {
    const session = this.sessions.get(guildId);
    if (!session) return "NOT_ACTIVE";
    this.destroySession(session);
    void this.nowPlaying?.update(guildId, "STOPPED", null).catch((error) => this.logs.error(guildId, "Şimdi Çalıyor mesajı güncellenemedi.", error));
    return "STOPPED";
  }

  private bindSessionEvents(session: StageSession): void {
    session.player.on(AudioPlayerStatus.Playing, () => {
      if (!this.isCurrent(session)) return;
      session.state = "PLAYING";
    });

    session.player.on(AudioPlayerStatus.Idle, (oldState) => {
      if (!this.isCurrent(session) || oldState.status === AudioPlayerStatus.Idle) return;
      const metadata = oldState.resource.metadata as TrackMetadata | null;
      if (!metadata || metadata.serial !== session.currentSerial) return;
      setTimeout(() => {
        if (!this.isCurrent(session) || metadata.serial !== session.currentSerial) return;
        if (session.handledSerial === metadata.serial) return;
        session.failedTracks.clear();
        if (session.state === "PAUSED") {
          session.advanceOnResume = true;
          return;
        }
        this.playNext(session);
      }, 25).unref();
    });

    session.player.on("error", (error) => {
      const metadata = error.resource.metadata as TrackMetadata | null;
      this.handleTrackFailure(session, metadata?.serial ?? session.currentSerial, error);
    });

    session.connection.on("error", (error) => {
      void this.logs.error(session.guildId, "Stage ses bağlantısında hata oluştu.", error);
    });

    session.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (!this.isCurrent(session)) return;
      try {
        await Promise.race([
          entersState(session.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(session.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (error) {
        if (!this.isCurrent(session)) return;
        this.destroySession(session);
        await this.logs.error(
          session.guildId,
          "Stage bağlantısı koptu; müzik oturumu temizlendi.",
          error,
        );
      }
    });

    session.connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.isCurrent(session)) this.destroySession(session, false);
    });
  }

  private playNext(session: StageSession): void {
    if (!this.isCurrent(session)) return;
    this.killTranscoder(session);

    if (session.index >= session.playlist.length) {
      session.playlist = shuffleTracks(session.playlist, session.lastPlayed);
      session.index = 0;
    }
    const track = session.playlist[session.index];
    if (!track) {
      this.destroySession(session);
      return;
    }

    session.index += 1;
    session.currentTrack = track;
    session.lastPlayed = track;
    session.currentSerial += 1;
    session.handledSerial = null;
    const serial = session.currentSerial;

    const transcoder = spawn(
      ffmpeg.path,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-i",
        track,
        "-vn",
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    session.transcoder = transcoder;
    let ffmpegError = "";
    transcoder.stderr?.on("data", (chunk: Buffer) => {
      if (ffmpegError.length < 1_500) ffmpegError += chunk.toString("utf8");
    });
    transcoder.once("error", (error) => this.handleTrackFailure(session, serial, error));
    transcoder.once("exit", (code, signal) => {
      if (!this.isCurrent(session) || serial !== session.currentSerial || code === 0) return;
      const detail = ffmpegError.trim() || `FFmpeg code=${String(code)}, signal=${String(signal)}`;
      this.handleTrackFailure(session, serial, new Error(detail));
    });

    if (!transcoder.stdout) {
      this.handleTrackFailure(session, serial, new Error("FFmpeg ses çıktısı oluşturamadı."));
      return;
    }
    const resource = createAudioResource<TrackMetadata>(transcoder.stdout, {
      inputType: StreamType.Raw,
      metadata: { serial, track },
    });
    session.player.play(resource);
    void this.nowPlaying?.update(session.guildId, "PLAYING", track).catch((error) => this.logs.error(session.guildId, "Şimdi Çalıyor mesajı güncellenemedi.", error));
  }

  private handleTrackFailure(session: StageSession, serial: number, error: unknown): void {
    if (!this.isCurrent(session) || serial !== session.currentSerial || session.handledSerial === serial) {
      return;
    }
    session.handledSerial = serial;
    if (session.currentTrack) session.failedTracks.add(session.currentTrack);
    void this.logs.error(
      session.guildId,
      `Stage müzik dosyası oynatılamadı ve atlandı: ${basename(session.currentTrack ?? "bilinmeyen")}`,
      error,
    );

    if (session.failedTracks.size >= session.playlist.length) {
      this.destroySession(session);
      void this.logs.error(
        session.guildId,
        "Stage listesindeki hiçbir MP3 oynatılamadı; oturum durduruldu.",
      );
      return;
    }
    if (session.state === "PAUSED") {
      session.advanceOnResume = true;
      return;
    }
    this.playNext(session);
  }

  private destroySession(session: StageSession, destroyConnection = true): void {
    if (this.sessions.get(session.guildId) === session) this.sessions.delete(session.guildId);
    this.killTranscoder(session);
    session.player.stop(true);
    if (destroyConnection && session.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      session.connection.destroy();
    }
    void this.nowPlaying?.update(session.guildId,"STOPPED",null).catch((error)=>this.logs.error(session.guildId,"Şimdi Çalıyor mesajı güncellenemedi.",error));
  }

  private killTranscoder(session: StageSession): void {
    const transcoder = session.transcoder;
    session.transcoder = null;
    if (transcoder && transcoder.exitCode === null && !transcoder.killed) transcoder.kill();
  }

  private isCurrent(session: StageSession): boolean {
    return this.sessions.get(session.guildId) === session;
  }
}

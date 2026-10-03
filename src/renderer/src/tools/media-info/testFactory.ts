// Nur für Tests: vollständige MediaInfo-/Spur-Objekte mit realistischen
// Standardwerten (1080p25 H.264 + AAC Stereo), gezielt überschreibbar.

import type { MediaAudioTrack, MediaInfo, MediaVideoTrack } from '@shared/types'

export function videoTrack(p: Partial<MediaVideoTrack> = {}): MediaVideoTrack {
  return {
    index: 0,
    codecName: 'h264',
    codec: 'H.264',
    profile: 'High',
    level: '4.1',
    fourcc: 'avc1',
    codecClass: 'longgop',
    width: 1920,
    height: 1080,
    displayWidth: 1920,
    displayHeight: 1080,
    sar: null,
    dar: '16:9',
    rotation: 0,
    mirrored: false,
    fps: 25,
    fpsRational: '25/1',
    fpsMode: 'cfr',
    scan: 'progressive',
    pixFmt: 'yuv420p',
    bitDepth: 8,
    chroma: '4:2:0',
    alpha: false,
    alphaNote: null,
    colorRange: 'tv',
    colorSpace: 'bt709',
    colorTransfer: 'bt709',
    colorPrimaries: 'bt709',
    hdr: null,
    dolbyVision: null,
    masteringMaxNits: null,
    maxCll: null,
    maxFall: null,
    bitRate: 10_000_000,
    bitRateEstimated: false,
    frames: 250,
    framesEstimated: false,
    durationSec: 10,
    hasBFrames: true,
    timecode: null,
    language: null,
    title: null,
    gop: null,
    ...p
  }
}

export function audioTrack(p: Partial<MediaAudioTrack> = {}): MediaAudioTrack {
  return {
    index: 1,
    codecName: 'aac',
    codec: 'AAC',
    profile: 'LC',
    channels: 2,
    channelLayout: 'stereo',
    layoutKnown: true,
    sampleRate: 48000,
    bitDepth: null,
    float: false,
    lossy: true,
    bitRate: 192_000,
    bitRateEstimated: false,
    durationSec: 10,
    language: null,
    title: null,
    isDefault: true,
    ...p
  }
}

export function mediaInfo(p: Partial<MediaInfo> = {}): MediaInfo {
  return {
    path: '/show/clip.mp4',
    name: 'clip.mp4',
    sizeBytes: 12_740_000,
    modifiedMs: null,
    formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
    container: 'MPEG-4 (MP4)',
    containerLong: 'QuickTime / MOV',
    extensionMismatch: false,
    probeScore: 100,
    isStill: false,
    durationSec: 10,
    startTimeSec: 0,
    bitRate: 10_192_000,
    bitRateEstimated: false,
    timecode: null,
    timecodeSource: null,
    title: null,
    encoder: null,
    creationTime: null,
    camera: null,
    location: null,
    incomplete: false,
    video: [videoTrack()],
    audio: [audioTrack()],
    subtitles: [],
    data: [],
    covers: [],
    attachments: 0,
    chapters: [],
    tags: [],
    deepAnalyzed: false,
    ...p
  }
}

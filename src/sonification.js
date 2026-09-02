// 着火・結露・溶解を短いWebAudio音へ変換する独立モジュール。

import { REACTION } from "./reactions.js";

export class AudioUnavailableError extends Error {
  constructor() {
    super("このブラウザではWebAudioを利用できません");
    this.name = "AudioUnavailableError";
  }
}

/**
 * 反応イベントを間引き・集約して音響エンジンへ渡す。
 * 入力：options（音響設定・エンジン生成関数）/ 出力：Sonifier互換オブジェクト。
 */
export function createSonifier(options = {}) {
  const createEngine = options.createEngine ?? (() => createWebAudioEngine(options));
  const minIntervalMs = options.minIntervalMs ?? 90;
  const pending = new Map();
  const lastPlayedAt = new Map();
  let engine = null;
  let enabled = false;

  return {
    get enabled() {
      return enabled;
    },

    /** ユーザー操作から音の有効・無効を切り替える。入力：boolean / 出力：Promise<void> */
    async setEnabled(nextEnabled) {
      if (nextEnabled) {
        engine ??= createEngine();
        await engine.resume();
        enabled = true;
        return;
      }
      enabled = false;
      pending.clear();
      if (engine) await engine.suspend();
    },

    /** 反応を次の発音候補へ集約する。入力：reaction event / 出力：なし */
    enqueue(event) {
      if (!enabled) return;
      const current = pending.get(event.type);
      pending.set(event.type, {
        ...event,
        count: (current?.count ?? 0) + 1,
      });
    },

    /** 巻き戻し前の未再生イベントを破棄する。入力：なし / 出力：なし */
    discardPending() {
      pending.clear();
    },

    /** 発音間隔を満たした反応だけ再生する。入力：現在時刻(ms) / 出力：発音数 */
    flush(nowMs) {
      if (!enabled || !engine) return 0;
      let played = 0;
      for (const [type, event] of pending) {
        const elapsed = nowMs - (lastPlayedAt.get(type) ?? -Infinity);
        if (elapsed < minIntervalMs) continue;
        engine.play(event);
        pending.delete(type);
        lastPlayedAt.set(type, nowMs);
        played++;
      }
      return played;
    },
  };
}

/**
 * WebAudioの音響エンジンを作る。
 * 入力：音量・音高設定 / 出力：{ resume, suspend, play }。
 */
export function createWebAudioEngine(options = {}) {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new AudioUnavailableError();

  const context = new AudioContextClass();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = options.masterGain ?? 0.12;
  master.connect(compressor);
  compressor.connect(context.destination);
  const noiseBuffer = createNoiseBuffer(context, options.noiseDuration ?? 0.24);

  return {
    resume: () => context.resume(),
    suspend: () => context.suspend(),
    play(event) {
      const countBoost = Math.min(1, 0.45 + Math.log2(event.count + 1) * 0.18);
      const pan = normalizedPan(event.x, options.cols);
      if (event.type === REACTION.IGNITION) {
        playTone(context, master, {
          type: "triangle",
          startHz: (options.ignitionHz ?? 720) * countBoost,
          endHz: (options.ignitionHz ?? 720) * 1.35,
          duration: 0.12,
          gain: 0.22 * countBoost,
          pan,
        });
      } else if (event.type === REACTION.CONDENSATION) {
        playTone(context, master, {
          type: "sine",
          startHz: options.condensationHz ?? 980,
          endHz: options.condensationEndHz ?? 620,
          duration: 0.17,
          gain: 0.18 * countBoost,
          pan,
        });
      } else if (event.type === REACTION.DISSOLUTION) {
        playNoise(context, master, noiseBuffer, {
          filterHz: options.dissolutionFilterHz ?? 420,
          duration: options.noiseDuration ?? 0.24,
          gain: 0.16 * countBoost,
          pan,
        });
      }
    },
  };
}

/** 盤面x座標をステレオ定位(-1〜1)へ変換する。 */
function normalizedPan(x, cols) {
  if (!Number.isFinite(cols) || cols <= 1) return 0;
  return Math.max(-1, Math.min(1, (x / (cols - 1)) * 2 - 1));
}

/** オシレーターへ短い音量包絡を付けて再生する。 */
function playTone(context, destination, options) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const panner = createPanner(context, options.pan);
  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.startHz, now);
  oscillator.frequency.exponentialRampToValueAtTime(options.endHz, now + options.duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(options.gain, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
  oscillator.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  oscillator.start(now);
  oscillator.stop(now + options.duration);
}

/** 低域フィルターを通した短いノイズを再生する。 */
function playNoise(context, destination, buffer, options) {
  const now = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const panner = createPanner(context, options.pan);
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = options.filterHz;
  gain.gain.setValueAtTime(options.gain, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  source.start(now);
  source.stop(now + options.duration);
}

/** ステレオ非対応環境ではGainNodeを中継として返す。 */
function createPanner(context, pan) {
  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    return panner;
  }
  return context.createGain();
}

/** 溶解音に使い回すホワイトノイズバッファを作る。 */
function createNoiseBuffer(context, duration) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

import type { AlertMessage } from '../core/alerts';

export type Sound = 'voice-vi' | 'voice-en' | 'ting';
export type BannerPermission = 'granted' | 'denied' | 'default' | 'unsupported';
export interface AlertOutput {
  play(sound: Sound): Promise<boolean>; // resolves when playback ends; false if blocked or failed
  vibrate(): boolean;
  showBanner(message: AlertMessage): Promise<boolean>;
  bannerPermission(): BannerPermission;
  requestBannerPermission(): Promise<BannerPermission>;
  hasUserActivation(): boolean;
}

const PLAY_TIMEOUT_MS = 10_000;
const SOUND_FILES: Record<Sound, string> = {
  'voice-vi': 'voice.wav',
  'voice-en': 'voice-en.wav',
  ting: 'ting.wav',
};

// None of the functions below may throw: a failing signal must not stop the others.
export function browserAlertOutput(
  baseUrl: string,
  makeAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src),
): AlertOutput {
  const audios: Partial<Record<Sound, HTMLAudioElement>> = {};
  for (const sound of Object.keys(SOUND_FILES) as Sound[]) {
    try {
      const audio = makeAudio(`${baseUrl}sounds/${SOUND_FILES[sound]}`);
      audio.preload = 'auto';
      audios[sound] = audio;
    } catch {
      // play() reports false for a sound that could not be created.
    }
  }

  const bannerPermission = (): BannerPermission => {
    try {
      return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    } catch {
      return 'unsupported';
    }
  };

  return {
    play(sound) {
      const audio = audios[sound];
      if (!audio) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (ok: boolean): void => {
          clearTimeout(timer);
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          resolve(ok);
        };
        // No 'pause' listener: browsers fire it just before 'ended' when a sound plays to the end.
        const onEnded = (): void => finish(true);
        const onError = (): void => finish(false);
        try {
          audio.addEventListener('ended', onEnded);
          audio.addEventListener('error', onError);
          timer = setTimeout(() => {
            try { audio.pause(); } catch { /* already stopped */ }
            finish(false);
          }, PLAY_TIMEOUT_MS);
          audio.currentTime = 0;
          Promise.resolve(audio.play()).catch(() => finish(false));
        } catch {
          finish(false);
        }
      });
    },

    vibrate() {
      try {
        return typeof navigator.vibrate === 'function' ? navigator.vibrate([200, 100, 200]) : false;
      } catch {
        return false;
      }
    },

    async showBanner(message) {
      try {
        if (bannerPermission() !== 'granted') return false;
        const registration = await navigator.serviceWorker?.getRegistration();
        if (!registration) return false;
        await registration.showNotification(message.title, {
          body: message.body,
          icon: `${baseUrl}pwa-192x192.png`,
          tag: 'village-timer-finished',
          // renotify is missing from TypeScript's NotificationOptions; without it a repeat alert silently replaces the old one.
          renotify: true,
        } as NotificationOptions);
        return true;
      } catch {
        return false;
      }
    },

    bannerPermission,

    async requestBannerPermission() {
      if (bannerPermission() === 'unsupported') return 'unsupported';
      try {
        return await Notification.requestPermission();
      } catch {
        return bannerPermission();
      }
    },

    hasUserActivation() {
      try {
        return navigator.userActivation?.hasBeenActive ?? true;
      } catch {
        return true;
      }
    },
  };
}

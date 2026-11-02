import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ghosttunes.app',
  appName: 'Ghosttunes',
  webDir: 'dist',
  android: {
    // Debug APKs can reach a tester's HTTP server on their local Wi-Fi.
    allowMixedContent: process.env.GHOSTTUNES_ANDROID_TEST === '1'
  },
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;

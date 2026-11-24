// screenOrientation="portrait" makes Android imply a REQUIRED
// android.hardware.screen.portrait feature, and Google Play then hides the app
// from devices it judges can't do portrait (some tablets, Chromebooks, Android XR).
// Declaring the feature explicitly as optional keeps the phone portrait lock but
// drops the install restriction.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest['uses-feature'] ??= []);
    const existing = features.find((f) => f.$['android:name'] === FEATURE);
    if (existing) existing.$['android:required'] = 'false';
    else features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
    return cfg;
  });
};

const { withInfoPlist } = require('expo/config-plugins');

module.exports = (config) =>
  withInfoPlist(config, (result) => {
    result.modResults.NSAppleMusicUsageDescription =
      'Sync uses your music library to show your Apple Music playlists and play the music you choose.';
    return result;
  });

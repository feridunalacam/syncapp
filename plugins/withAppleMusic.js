const { withInfoPlist } = require('expo/config-plugins');

module.exports = (config) =>
  withInfoPlist(config, (result) => {
    result.modResults.NSAppleMusicUsageDescription =
      'Sync uses Apple Music only when you connect it to choose and play songs and playlists for your workout rounds.';
    return result;
  });

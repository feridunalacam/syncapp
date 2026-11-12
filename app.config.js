const nativeAdMobOptions = require('./config/admob.cjs');

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    './plugins/withAppleMusic',
    ['react-native-google-mobile-ads', nativeAdMobOptions(process.env)],
  ],
});

const nativeAdMobOptions = require('./config/admob.cjs');

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ['react-native-google-mobile-ads', nativeAdMobOptions(process.env)],
  ],
});

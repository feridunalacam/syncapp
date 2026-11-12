import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSubscriptionConfig } from '../src/services/subscriptions/config.js';

const profiles = ['development', 'preview', 'production'];
const platforms = ['ios', 'android'];
export const releaseConfigMessages = {
  profile: 'Choose an existing development, preview or production EAS profile.',
  platform: 'Choose --platform ios or --platform android.',
  inheritance: 'The EAS profile inheritance is missing, invalid or circular.',
  supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL must be a real public HTTPS backend URL.',
  supabaseKey: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key.',
  revenuecat:
    'The selected platform needs its matching public RevenueCat SDK key. Test Store keys are debug-development only.',
  legal: 'EXPO_PUBLIC_PRIVACY_URL and EXPO_PUBLIC_TERMS_URL must be public HTTPS pages.',
  publicSecrets: 'Private credentials must not use EXPO_PUBLIC_ variables.',
  adFlag: 'EXPO_PUBLIC_ADS_ENABLED must be exactly true or false when supplied.',
  adIds:
    'Enabled release ads need matching real app, banner and interstitial IDs for the selected platform.',
  environment: 'The selected EAS environment is not explicit; verify remote environment selection.',
  cloud:
    'Only supplied local process variables (.env.local when explicitly loaded) plus inherited eas.json values were checked. Remote EAS values, project linking, signing, store approval and live services are not verified.',
};

function httpsPublic(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !/^(?:localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) &&
      !/(?:^|\.)(?:example\.(?:com|org|net)|invalid|localhost)$/.test(url.hostname) &&
      !/YOUR[_-]?PROJECT|REPLACE[_-]?ME|PLACEHOLDER/i.test(value)
    );
  } catch {
    return false;
  }
}

function publicSupabaseKey(value) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    /REPLACE[_-]?ME|YOUR[_-]?KEY|PLACEHOLDER/i.test(value)
  )
    return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split('.');
    return (
      parts.length === 3 &&
      parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) &&
      JSON.parse(Buffer.from(parts[1], 'base64url')).role === 'anon'
    );
  } catch {
    return false;
  }
}

export function resolveProfile(eas, profile, visited = new Set()) {
  if (visited.has(profile) || !eas?.build?.[profile])
    throw new Error(releaseConfigMessages.inheritance);
  visited.add(profile);
  const current = eas.build[profile];
  const parent = current.extends ? resolveProfile(eas, current.extends, visited) : {};
  return { ...parent, ...current, env: { ...parent.env, ...current.env } };
}

// Cloud builds must validate their actual environment without filling missing
// values from eas.json or a local dotenv file. The manual checker below still
// resolves local/profile precedence explicitly.
export function checkReleaseValues({ platform, profile = 'production', env: values = {} } = {}) {
  const errors = [];
  if (!platforms.includes(platform)) errors.push('platform');
  if (!profiles.includes(profile)) errors.push('profile');
  if (errors.length) return errors;
  const release = profile !== 'development';
  if (!httpsPublic(values.EXPO_PUBLIC_SUPABASE_URL)) errors.push('supabaseUrl');
  if (!publicSupabaseKey(values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) errors.push('supabaseKey');
  const subscription = createSubscriptionConfig({ platform, profile, dev: !release, env: values });
  if (!subscription.enabled || /REPLACE[_-]?ME|YOUR[_-]?KEY|PLACEHOLDER/i.test(subscription.apiKey))
    errors.push('revenuecat');
  if (!httpsPublic(values.EXPO_PUBLIC_PRIVACY_URL) || !httpsPublic(values.EXPO_PUBLIC_TERMS_URL))
    errors.push('legal');
  if (
    Object.keys(values).some(
      (key) => /^EXPO_PUBLIC_.*(?:SECRET|SERVICE_ROLE|PASSWORD|WEBHOOK)/.test(key) && values[key],
    )
  )
    errors.push('publicSecrets');
  const adFlag = values.EXPO_PUBLIC_ADS_ENABLED;
  if (adFlag !== undefined && !['true', 'false'].includes(adFlag)) errors.push('adFlag');
  if (release && adFlag === 'true') {
    const appId = platform === 'ios' ? values.ADMOB_IOS_APP_ID : values.ADMOB_ANDROID_APP_ID;
    const bannerId =
      platform === 'ios'
        ? values.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID
        : values.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID;
    const interstitialId =
      platform === 'ios'
        ? values.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID
        : values.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID;
    const exact = (value, pattern) =>
      typeof value === 'string' && value.trim() === value ? pattern.exec(value) : null;
    const app = exact(appId, /^ca-app-pub-(\d{16})~\d{10}$/);
    const units = [bannerId, interstitialId].map((id) =>
      exact(id, /^ca-app-pub-(\d{16})\/\d{10}$/),
    );
    if (!app || app[1] === '3940256099942544' || units.some((unit) => !unit || app[1] !== unit[1]))
      errors.push('adIds');
  }
  return errors;
}

export function checkReleaseConfig({ platform, profile = 'production', env = {}, eas = {} } = {}) {
  const errors = [];
  const warnings = [];
  if (!platforms.includes(platform)) errors.push('platform');
  if (!profiles.includes(profile) || !eas?.build?.[profile]) errors.push('profile');
  let selected;
  try {
    if (!errors.includes('profile')) selected = resolveProfile(eas, profile);
  } catch {
    errors.push('inheritance');
  }
  if (!selected || errors.includes('platform')) return { errors, warnings };
  // EAS profile env overrides the local process env. This does not fetch the
  // remote environment or imply that ignored local files reach cloud builds.
  errors.push(...checkReleaseValues({ platform, profile, env: { ...env, ...selected.env } }));
  if (selected.environment !== profile) warnings.push('environment');
  warnings.push('cloud');
  return { errors, warnings };
}

export function runPreflight(
  args,
  { env = process.env, root = process.cwd(), write = console.log } = {},
) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--platform', '--profile'].includes(flag) || !args[i + 1]) {
      write(
        'Usage: npm run check:release -- --platform ios|android --profile production|preview|development',
      );
      return 1;
    }
    options[flag.slice(2)] = args[i + 1];
  }
  let eas;
  try {
    eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  } catch {
    write('FAIL: Could not read eas.json.');
    return 1;
  }
  const { errors, warnings } = checkReleaseConfig({ ...options, env, eas });
  for (const code of errors) write(`FAIL: ${releaseConfigMessages[code]}`);
  for (const code of warnings) write(`NOTE: ${releaseConfigMessages[code]}`);
  if (!errors.length) write('PASS: Selected local/profile configuration format checks passed.');
  return errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runPreflight(process.argv.slice(2));
}

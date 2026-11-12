import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReleaseValues, releaseConfigMessages } from './check-release-config.mjs';

export function runEasBuildPreflight({ env = process.env, write = console.log } = {}) {
  const buildContext = [
    'EAS_BUILD',
    'EAS_BUILD_PLATFORM',
    'EAS_BUILD_PROFILE',
    'EAS_BUILD_RUNNER',
    'EAS_BUILD_ID',
  ].some((key) => env[key] !== undefined);
  if (!buildContext) {
    write(
      'SKIP: No EAS build context. Use npm run check:release for a manual local/profile check.',
    );
    return 0;
  }

  const platform = env.EAS_BUILD_PLATFORM;
  const profile = env.EAS_BUILD_PROFILE;
  // Treat incomplete/unknown builder identity as an error, rather than
  // accidentally allowing a release to take the development skip path.
  if (
    env.EAS_BUILD !== 'true' ||
    !['ios', 'android'].includes(platform) ||
    !['development', 'preview', 'production'].includes(profile)
  ) {
    write(
      'FAIL: EAS build context requires EAS_BUILD=true, a known profile and ios/android platform.',
    );
    return 1;
  }
  if (env.EXPO_PUBLIC_BUILD_PROFILE !== profile) {
    write('FAIL: EXPO_PUBLIC_BUILD_PROFILE must match EAS_BUILD_PROFILE exactly.');
    return 1;
  }
  if (profile === 'development') {
    write('SKIP: Development build preserves the core app without release service configuration.');
    return 0;
  }

  const errors = checkReleaseValues({ platform, profile, env });
  for (const code of errors) write(`FAIL: ${releaseConfigMessages[code]}`);
  if (!errors.length) {
    write('PASS: EAS release environment format checks passed for the build platform and profile.');
    write('NOTE: Signing, store approval and live services are separate release gates.');
  }
  return errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runEasBuildPreflight();
}

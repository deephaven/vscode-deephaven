import { DHE_GRADLE_VERSION_REGEX, DHE_MINOR_VERSION } from '../common';
import type { GradleVersion } from '../types';

/**
 * Parse a given gradle version string into a GradleVersion object.
 * @param gradleVersion The gradle version string to parse.
 * @returns A GradleVersion object or null if the version string is invalid.
 */
export function parseGradleVersion(
  gradleVersion: string
): GradleVersion | null {
  const result = DHE_GRADLE_VERSION_REGEX.exec(gradleVersion);
  if (result == null) {
    return null;
  }

  const [, major, minor, patch, tag] = result;

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    tag,
  };
}

/**
 * Check if the given gradle version supports the DHE Create Query UI.
 * @param gradleVersion The gradle version string to check.
 * @returns True if the version supports the DHE create query UI, false otherwise.
 */
export function isDheCreateQueryUISupported(gradleVersion: string): boolean {
  const parsedVersion = parseGradleVersion(gradleVersion);
  if (parsedVersion == null) {
    return false;
  }

  const { minor, patch } = parsedVersion;

  // TODO: Update this version once PR is ready to be merged
  return minor === DHE_MINOR_VERSION.sanLuis && patch >= 237;
}

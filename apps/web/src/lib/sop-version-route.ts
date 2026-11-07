export function sopVersionPath(version: {
  sopId: string;
  versionNumber: number;
}): `/sops/${string}/versions/${number}` {
  return `/sops/${encodeURIComponent(version.sopId)}/versions/${version.versionNumber}`;
}

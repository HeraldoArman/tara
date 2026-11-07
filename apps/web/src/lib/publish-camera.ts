interface CameraTrack {
  detach: () => unknown;
  stop: () => void;
}

interface CameraPublication<T extends CameraTrack> {
  create: () => Promise<T>;
  isCurrent: () => boolean;
  publish: (track: T) => Promise<unknown>;
  unpublish: (track: T) => Promise<unknown>;
}

/** A permission prompt or publication may finish after its session has gone away. */
export async function publishCameraTrack<T extends CameraTrack>({
  create,
  isCurrent,
  publish,
  unpublish,
}: CameraPublication<T>): Promise<T | null> {
  const track = await create();
  if (!isCurrent()) {
    track.stop();
    track.detach();
    return null;
  }
  try {
    await publish(track);
    if (isCurrent()) {
      return track;
    }
  } catch (error) {
    track.stop();
    track.detach();
    await unpublish(track).catch(() => undefined);
    if (isCurrent()) {
      throw error;
    }
    return null;
  }
  track.stop();
  track.detach();
  await unpublish(track).catch(() => undefined);
  return null;
}

export type WorkerSelection = 'auto' | number;

export interface DeviceCapabilities {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

export function selectWorkers(
  selection: WorkerSelection,
  capabilities: DeviceCapabilities,
): number {
  if (
    selection !== 'auto' &&
    (!Number.isSafeInteger(selection) || selection < 1)
  )
    throw Error('workers must be auto or a positive integer');
  if (selection !== 'auto') return selection;
  return (capabilities.hardwareConcurrency ?? 0) >= 4 &&
    (capabilities.deviceMemory ?? 0) >= 4
    ? 2
    : 1;
}

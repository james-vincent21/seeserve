export interface UnattendedInput {
  seatedSince: number;
  now: number;
  thresholdMs: number;
  staffVisitAt: number | null;
  alreadyAlerted: boolean;
}

export function shouldRaiseUnattendedAlert(input: UnattendedInput): boolean {
  if (input.alreadyAlerted || input.now - input.seatedSince < input.thresholdMs) return false;
  return input.staffVisitAt === null || input.staffVisitAt < input.seatedSince;
}

export interface HandRaiseInput {
  wristAboveShoulder: boolean;
  heldForMs: number;
  requiredHoldMs: number;
  insideGuestTableZone: boolean;
  cooldownElapsed: boolean;
}

export function shouldRaiseHandAlert(input: HandRaiseInput): boolean {
  return input.wristAboveShoulder && input.heldForMs >= input.requiredHoldMs &&
    input.insideGuestTableZone && input.cooldownElapsed;
}

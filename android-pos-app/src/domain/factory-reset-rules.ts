import type { LocalUser } from "./models";

export const FACTORY_RESET_PHRASE = "FACTORY RESET";

export function canAccessFactoryReset(user: Pick<LocalUser, "role">) {
  return user.role === "OWNER";
}

export function isFactoryResetPhrase(value: string) {
  return value === FACTORY_RESET_PHRASE;
}

export function canContinueWithoutBackup(createBackup: boolean, acknowledgedNoBackup: boolean) {
  return createBackup || acknowledgedNoBackup;
}

export function nextFactoryResetStep(step: "warning" | "reauthenticate" | "phrase") {
  if (step === "warning") return "reauthenticate" as const;
  if (step === "reauthenticate") return "phrase" as const;
  return "final" as const;
}

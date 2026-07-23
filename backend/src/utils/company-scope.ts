export type NonEmptyCodes = [string, ...string[]];

export function hasEmployeeCodes(codes: string[]): codes is NonEmptyCodes {
  return codes.length > 0;
}

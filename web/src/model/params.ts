import { PARAMS, type ParamDef } from "../generated/params";

export type { ParamDef };

/** Size of a Values array: indexed by parameter id (design 4.4). */
export const VALUES_LENGTH = 247;

const byId = new Map<number, ParamDef>(PARAMS.map((p) => [p.id, p]));

/** Definition of a sound parameter id, or undefined when the id is not in PARAMS. */
export function paramById(id: number): ParamDef | undefined {
  return byId.get(id);
}

/** Parameters of one voice (0..5), or the global ones with voice -1, in id order. */
export function paramsOfVoice(voice: ParamDef["voice"]): ParamDef[] {
  return PARAMS.filter((p) => p.voice === voice);
}

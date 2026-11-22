import type { ParamDef } from "../generated/params";
import { Station } from "./Station";

/** Mentor: the LFO's character only (design 4.12.8). */
export const MentorCard = (props: { rows: readonly ParamDef[] }) => (
  <Station station="mentor" kind="mentor" title="Mentor" subtitle="LFO of the voice" rows={props.rows} />
);

/** Bindings: where the Mentor and the Oracle act. shortcut: the incoming-from-other-voices list is not shown yet. */
export const BindingsCard = (props: { rows: readonly ParamDef[] }) => (
  <Station station="bindings" kind="bindings" title="Bindings" subtitle="one target each" rows={props.rows} />
);

/** Oracle: velocity strength only. */
export const OracleCard = (props: { rows: readonly ParamDef[] }) => (
  <Station station="oracle" kind="oracle" title="Oracle" subtitle="velocity of the voice" rows={props.rows} />
);

import { createMemo } from "solid-js";
import { FX_LABELS, type ParamDef } from "../generated/params";
import { brewRows, stationRows } from "../model/stations";
import { useSession } from "../state/session";
import { valueOf } from "./param";
import { Station } from "./Station";
import styles from "./Journey.module.css";

/** The FX bus and the all-voice parameters as three stations (design 4.12.3). */
export function CauldronPage() {
  const session = useSession();
  const typeDef = () => stationRows(-1, "brew").find((p) => p.name === "fx_type")!;
  // Memos: the rows must be rebuilt only when the effect changes. A plain function would rebuild the
  // labelled copies on every value change, and the For below would then re-create the row (and its
  // slider) under a dragging pointer after the first step.
  const effect = createMemo(() => typeDef().values![valueOf(session, typeDef()) - typeDef().min]!);
  // Rows carry the effect's own labels for fx_p1..fx_p4 (a copy, so every control shows the same text).
  const brew = createMemo((): ParamDef[] => brewRows(effect()).map((p) => {
    const k = /^fx_p([1-4])$/.exec(p.name);
    const labels = FX_LABELS[effect() as keyof typeof FX_LABELS];
    return k && labels ? { ...p, label: labels[Number(k[1]) - 1]! } : p;
  }));
  return (
    <div class={styles.journey} data-journey="cauldron">
      <div class={styles.stations}>
        <Station station="brew" title="The Brew" subtitle="effect" voice={-1} rows={brew()} />
        <Station station="pour" title="The Pour" subtitle="mix" voice={-1} rows={stationRows(-1, "pour")} />
        <Station station="millstone" title="The Millstone" subtitle="all voices" voice={-1}
          rows={stationRows(-1, "millstone")} />
      </div>
    </div>
  );
}

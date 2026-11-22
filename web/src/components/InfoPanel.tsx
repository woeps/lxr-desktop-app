import { TABLE_ID } from "../generated/params";
import { NOTICE_NO_FLASH, NOTICE_NOT_SEEN, NOTICE_ONE_WAY } from "./notices";
import { SidePanel } from "./SidePanel";

/** Info panel (R5.9): the parameter table id and the three notices. */
export function InfoPanel() {
  return (
    <SidePanel title="Info" glyph="info">
      <p>Parameter table <code data-testid="table-id">{TABLE_ID}</code></p>
      <p data-testid="notice-no-flash">{NOTICE_NO_FLASH}</p>
      <p>{NOTICE_ONE_WAY}</p>
      <p data-testid="notice-not-seen">{NOTICE_NOT_SEEN}</p>
    </SidePanel>
  );
}

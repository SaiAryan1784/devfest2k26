import type { Metadata } from "next";
import { TrackPicker } from "@/components/dgl/TrackPicker";
import { DGL } from "@/data/dgl";
import { EVENT } from "@/data/event";

export const metadata: Metadata = {
  title: `${DGL.copy.stageTitle} | ${EVENT.name}`,
};

/** A projector opens this and picks its track. */
export default function StagePickerPage() {
  return <TrackPicker title={DGL.copy.pickStageTitle} body={DGL.copy.pickStageBody} hrefFor={(t) => `/dgl/${t}/stage`} />;
}

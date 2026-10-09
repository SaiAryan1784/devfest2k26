import { TrackPicker } from "@/components/dgl/TrackPicker";
import { DGL } from "@/data/dgl";

/** The room picker: three tracks run at once, each with its own voting page. The old QR code lands here. */
export default function DglPage() {
  return <TrackPicker title={DGL.copy.pickRoomTitle} body={DGL.copy.pickRoomBody} hrefFor={(t) => `/dgl/${t}`} />;
}

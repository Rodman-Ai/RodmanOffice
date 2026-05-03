import MeetingClient from "./MeetingClient";
import { SEED_MEETINGS } from "@/lib/demo/seed";

export function generateStaticParams() {
  return SEED_MEETINGS.map((m) => ({ slug: m.slug }));
}

export default function Page() {
  return <MeetingClient />;
}

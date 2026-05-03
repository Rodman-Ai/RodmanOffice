import DealDetailClient from "./DealDetailClient";
import { SEED_DEALS } from "@/lib/demo/seed";

export function generateStaticParams() {
  return SEED_DEALS.map((d) => ({ id: d.id }));
}

export default function Page() {
  return <DealDetailClient />;
}

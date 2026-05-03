import PublicFormClient from "./PublicFormClient";
import { SEED_FORMS } from "@/lib/demo/seed";

export function generateStaticParams() {
  return SEED_FORMS.map((f) => ({ slug: f.slug }));
}

export default function Page() {
  return <PublicFormClient />;
}

import ContactDetailClient from "./ContactDetailClient";
import { SEED_CONTACTS } from "@/lib/demo/seed";

export function generateStaticParams() {
  // Pre-render seed contact pages for the static demo.
  return SEED_CONTACTS.map((c) => ({ id: c.id }));
}

export default function Page() {
  return <ContactDetailClient />;
}

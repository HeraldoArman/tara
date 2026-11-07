import type { Metadata } from "next";
import { PhoneCamera } from "@/components/assistant/phone-camera";

export const metadata: Metadata = {
  description: "Use your phone camera in your tara work session.",
  referrer: "no-referrer",
  robots: { follow: false, index: false },
  title: "Phone camera",
};

export default function PairCameraPage() {
  return <PhoneCamera />;
}

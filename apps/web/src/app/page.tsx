import { Landing } from "@/landing/Landing";
import { TicketStage } from "@/landing/TicketStage";

export default function Home() {
  return <Landing stage={<TicketStage />} />;
}

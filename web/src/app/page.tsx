import { CommandOSLanding } from "@/components/CommandOSLanding";
import { CallProvider } from "@/components/CallProvider";

export default function Home() {
  return (
    <CallProvider role="user" enableMicOnConnect>
      <CommandOSLanding />
    </CallProvider>
  );
}

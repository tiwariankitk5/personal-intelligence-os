import PiosConnectedApp from "@/components/pios-connected-app";

// Always load the current deployment's asset references for this signed-in app.
export const dynamic = "force-dynamic";

export default function Home() {
  return <PiosConnectedApp />;
}
